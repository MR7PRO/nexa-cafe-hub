-- ============ PART C: SKU / BARCODE ============
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS barcode text;

CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_barcode_uniq
  ON public.products (tenant_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_tenant_sku_idx
  ON public.products (tenant_id, sku)
  WHERE sku IS NOT NULL;

-- ============ PART A: INVENTORY MOVEMENTS ============
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  movement_type text NOT NULL CHECK (movement_type IN ('sale','restock','manual_adjustment','damaged','expired','refund')),
  quantity_change integer NOT NULL,
  quantity_before integer,
  quantity_after integer,
  reference_type text,
  reference_id uuid,
  reason text,
  unit_cost_ils numeric,
  supplier text,
  performed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view inventory movements"
ON public.inventory_movements FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS inventory_movements_tenant_created_idx
  ON public.inventory_movements (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_product_created_idx
  ON public.inventory_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_reference_idx
  ON public.inventory_movements (reference_type, reference_id);

-- ============ RESTOCK ============
CREATE OR REPLACE FUNCTION public.restock_product(
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost_ils numeric DEFAULT NULL,
  p_supplier text DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _p record;
  _before integer;
  _after integer;
  _cost numeric := NULLIF(p_unit_cost_ils, NULL);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager') OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'هذه العملية تتطلب صلاحية مدير';
  END IF;
  IF COALESCE(p_quantity,0) <= 0 THEN RAISE EXCEPTION 'الكمية غير صحيحة'; END IF;

  SELECT * INTO _p FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF _p.id IS NULL OR (_p.tenant_id <> _tenant AND NOT public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;

  _before := COALESCE(_p.stock_qty, 0);
  _after := _before + p_quantity;

  -- current cost only; historical COGS snapshots on ticket_items stay untouched
  UPDATE public.products
  SET stock_qty = _after,
      cost_price_ils = CASE WHEN _cost IS NOT NULL AND _cost >= 0 THEN _cost ELSE cost_price_ils END
  WHERE id = p_product_id;

  INSERT INTO public.inventory_movements (
    tenant_id, product_id, movement_type, quantity_change, quantity_before, quantity_after,
    reference_type, reason, unit_cost_ils, supplier, performed_by
  ) VALUES (
    _p.tenant_id, p_product_id, 'restock', p_quantity, _before, _after,
    'restock', NULLIF(btrim(COALESCE(p_note,'')), ''), _cost, NULLIF(btrim(COALESCE(p_supplier,'')), ''), _uid
  );

  PERFORM public.log_audit_event('inventory_restocked', 'product', p_product_id,
    jsonb_build_object('name', _p.name, 'quantity', p_quantity,
      'unit_cost_ils', _cost, 'supplier', p_supplier, 'quantity_after', _after),
    _p.tenant_id, _uid);

  RETURN jsonb_build_object('product_id', p_product_id, 'quantity_before', _before, 'quantity_after', _after);
END;
$$;

-- ============ MANUAL ADJUSTMENT / DAMAGED / EXPIRED ============
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id uuid,
  p_movement_type text,
  p_quantity_change integer,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _p record;
  _type text := CASE WHEN p_movement_type IN ('manual_adjustment','damaged','expired') THEN p_movement_type ELSE NULL END;
  _reason text := NULLIF(btrim(COALESCE(p_reason,'')), '');
  _delta integer;
  _before integer;
  _after integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager') OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'هذه العملية تتطلب صلاحية مدير';
  END IF;
  IF _type IS NULL THEN RAISE EXCEPTION 'نوع الحركة غير مدعوم'; END IF;
  IF _reason IS NULL THEN RAISE EXCEPTION 'السبب مطلوب'; END IF;
  IF COALESCE(p_quantity_change,0) = 0 THEN RAISE EXCEPTION 'الكمية غير صحيحة'; END IF;

  SELECT * INTO _p FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF _p.id IS NULL OR (_p.tenant_id <> _tenant AND NOT public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;

  -- damaged / expired always reduce stock
  _delta := CASE WHEN _type IN ('damaged','expired') THEN -ABS(p_quantity_change) ELSE p_quantity_change END;
  _before := COALESCE(_p.stock_qty, 0);
  _after := _before + _delta;
  IF _after < 0 THEN RAISE EXCEPTION 'المخزون غير كافٍ'; END IF;

  UPDATE public.products SET stock_qty = _after WHERE id = p_product_id;

  INSERT INTO public.inventory_movements (
    tenant_id, product_id, movement_type, quantity_change, quantity_before, quantity_after,
    reference_type, reason, performed_by
  ) VALUES (
    _p.tenant_id, p_product_id, _type, _delta, _before, _after, 'adjustment', _reason, _uid
  );

  PERFORM public.log_audit_event('inventory_adjusted', 'product', p_product_id,
    jsonb_build_object('name', _p.name, 'movement_type', _type,
      'quantity_change', _delta, 'quantity_after', _after, 'reason', _reason),
    _p.tenant_id, _uid);

  RETURN jsonb_build_object('product_id', p_product_id, 'quantity_before', _before, 'quantity_after', _after);
END;
$$;

-- ============ PART D: PAGINATED PRODUCT HISTORY ============
CREATE OR REPLACE FUNCTION public.get_inventory_movements(
  p_product_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _limit integer := LEAST(GREATEST(COALESCE(p_limit,20),1),100);
  _offset integer := GREATEST(COALESCE(p_offset,0),0);
  _total integer;
  _rows jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = p_product_id AND (tenant_id = _tenant OR public.is_super_admin(_uid))
  ) THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;

  SELECT COUNT(*)::integer INTO _total
  FROM public.inventory_movements WHERE product_id = p_product_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'created_at', m.created_at,
    'movement_type', m.movement_type,
    'quantity_change', m.quantity_change,
    'quantity_before', m.quantity_before,
    'quantity_after', m.quantity_after,
    'reference_type', m.reference_type,
    'reference_id', m.reference_id,
    'reason', m.reason,
    'unit_cost_ils', m.unit_cost_ils,
    'supplier', m.supplier,
    'performed_by', m.performed_by,
    'performed_by_name', pr.name
  ) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO _rows
  FROM (
    SELECT * FROM public.inventory_movements
    WHERE product_id = p_product_id
    ORDER BY created_at DESC LIMIT _limit OFFSET _offset
  ) m
  LEFT JOIN public.profiles pr ON pr.id = m.performed_by;

  RETURN jsonb_build_object('total', COALESCE(_total,0), 'movements', _rows,
                            'limit', _limit, 'offset', _offset);
END;
$$;

-- ============ POS: log sale movements in the same transaction ============
CREATE OR REPLACE FUNCTION public.process_sale(p_items jsonb, p_payments jsonb, p_promotion_id uuid DEFAULT NULL::uuid, p_manual_discount_ils numeric DEFAULT 0, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _item jsonb;
  _qty integer;
  _product record;
  _subtotal numeric := 0;
  _discount numeric := 0;
  _total numeric := 0;
  _ticket_id uuid;
  _ticket_no text;
  _part jsonb;
  _lines jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'السلة فارغة';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND tenant_id = _tenant
  ) THEN
    RAISE EXCEPTION 'الزبون غير موجود';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    _qty := COALESCE((_item->>'qty')::integer, 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'الكمية غير صحيحة'; END IF;

    SELECT id, name, sell_price_ils, cost_price_ils, stock_qty, is_active, tenant_id
      INTO _product
    FROM public.products
    WHERE id = (_item->>'product_id')::uuid
    FOR UPDATE;

    IF _product.id IS NULL OR _product.tenant_id <> _tenant THEN
      RAISE EXCEPTION 'المنتج غير موجود';
    END IF;
    IF NOT _product.is_active THEN
      RAISE EXCEPTION 'المنتج % غير مفعّل', _product.name;
    END IF;
    IF _product.stock_qty IS NOT NULL AND _product.stock_qty < _qty THEN
      RAISE EXCEPTION 'الكمية المتوفرة من % هي % فقط', _product.name, _product.stock_qty;
    END IF;

    _subtotal := _subtotal + (_product.sell_price_ils * _qty);
    _lines := _lines || jsonb_build_object(
      'ref_id', _product.id,
      'name', _product.name,
      'qty', _qty,
      'unit_price_ils', _product.sell_price_ils,
      'unit_cost_ils', _product.cost_price_ils,
      'total_ils', ROUND(_product.sell_price_ils * _qty, 2)
    );
  END LOOP;

  _subtotal := ROUND(_subtotal, 2);
  _discount := public.compute_promotion_discount(_tenant, p_promotion_id, _subtotal, 'products');
  _discount := LEAST(_subtotal, _discount + GREATEST(COALESCE(p_manual_discount_ils, 0), 0));
  _total := GREATEST(ROUND(_subtotal - _discount, 2), 0);

  PERFORM public.validate_payment_parts(p_payments, _total);

  _ticket_no := public.next_ticket_no(_tenant);

  INSERT INTO public.tickets (ticket_no, status, created_by, tenant_id, discount_ils, total_ils, closed_at, customer_id)
  VALUES (_ticket_no, 'paid', _uid, _tenant, _discount, _total, now(), p_customer_id)
  RETURNING id INTO _ticket_id;

  INSERT INTO public.ticket_items (ticket_id, tenant_id, item_type, ref_id, name, qty, unit_price_ils, unit_cost_ils, total_ils)
  SELECT _ticket_id, _tenant, 'product',
         (l->>'ref_id')::uuid, l->>'name', (l->>'qty')::integer,
         (l->>'unit_price_ils')::numeric, (l->>'unit_cost_ils')::numeric,
         (l->>'total_ils')::numeric
  FROM jsonb_array_elements(_lines) l;

  FOR _part IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.payments (ticket_id, tenant_id, method, amount_ils)
    VALUES (_ticket_id, _tenant, (_part->>'method')::payment_method, (_part->>'amount')::numeric);
  END LOOP;

  -- stock stays authoritative on products; the ledger records the same change atomically
  WITH agg AS (
    SELECT (l->>'ref_id')::uuid AS id, SUM((l->>'qty')::integer)::integer AS qty
    FROM jsonb_array_elements(_lines) l GROUP BY 1
  ), upd AS (
    UPDATE public.products p
    SET stock_qty = p.stock_qty - agg.qty
    FROM agg
    WHERE p.id = agg.id AND p.stock_qty IS NOT NULL
    RETURNING p.id, p.tenant_id, p.stock_qty AS after_qty, agg.qty AS qty
  )
  INSERT INTO public.inventory_movements (
    tenant_id, product_id, movement_type, quantity_change, quantity_before, quantity_after,
    reference_type, reference_id, performed_by
  )
  SELECT u.tenant_id, u.id, 'sale', -u.qty, u.after_qty + u.qty, u.after_qty,
         'ticket', _ticket_id, _uid
  FROM upd u;

  IF EXISTS (SELECT 1 FROM public.products WHERE tenant_id = _tenant AND stock_qty < 0) THEN
    RAISE EXCEPTION 'المخزون غير كافٍ';
  END IF;

  PERFORM public.log_audit_event('ticket_paid', 'ticket', _ticket_id,
    jsonb_build_object(
      'ticket_no', _ticket_no,
      'total_ils', _total,
      'discount_ils', _discount,
      'items', jsonb_array_length(_lines),
      'source', 'pos'
    ), _tenant, _uid);

  RETURN jsonb_build_object(
    'ticket_id', _ticket_id,
    'ticket_no', _ticket_no,
    'subtotal_ils', _subtotal,
    'discount_ils', _discount,
    'total_ils', _total
  );
END;
$function$;

-- ============ VOID/REFUND: log the stock return ============
CREATE OR REPLACE FUNCTION public.void_ticket(p_ticket_id uuid, p_reason text, p_mode text DEFAULT 'void'::text, p_refund_amount_ils numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tenant uuid;
  _t record;
  _mode text := CASE WHEN p_mode = 'refund' THEN 'refund' ELSE 'void' END;
  _reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  _refund numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;

  IF NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'manager') OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'هذه العملية تتطلب صلاحية مدير';
  END IF;

  IF _reason IS NULL THEN RAISE EXCEPTION 'سبب الإلغاء مطلوب'; END IF;

  SELECT * INTO _t FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF _t.id IS NULL OR (_t.tenant_id <> _tenant AND NOT public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة';
  END IF;
  IF _t.status = 'void' THEN RAISE EXCEPTION 'الفاتورة ملغاة مسبقاً'; END IF;

  _refund := CASE WHEN _mode = 'refund'
                  THEN LEAST(GREATEST(COALESCE(p_refund_amount_ils, _t.total_ils), 0), _t.total_ils)
                  ELSE 0 END;

  -- return stock for product lines (original ticket rows stay untouched)
  WITH agg AS (
    SELECT i.ref_id AS id, SUM(i.qty)::integer AS qty
    FROM public.ticket_items i
    WHERE i.ticket_id = p_ticket_id AND i.item_type = 'product' AND i.ref_id IS NOT NULL
    GROUP BY i.ref_id
  ), upd AS (
    UPDATE public.products p
    SET stock_qty = p.stock_qty + agg.qty
    FROM agg
    WHERE p.id = agg.id AND p.stock_qty IS NOT NULL
    RETURNING p.id, p.tenant_id, p.stock_qty AS after_qty, agg.qty AS qty
  )
  INSERT INTO public.inventory_movements (
    tenant_id, product_id, movement_type, quantity_change, quantity_before, quantity_after,
    reference_type, reference_id, reason, performed_by
  )
  SELECT u.tenant_id, u.id, 'refund', u.qty, u.after_qty - u.qty, u.after_qty,
         'ticket', p_ticket_id, _reason, _uid
  FROM upd u;

  UPDATE public.tickets
  SET status = 'void',
      void_type = _mode,
      void_reason = _reason,
      voided_by = _uid,
      voided_at = now(),
      refund_amount_ils = _refund
  WHERE id = p_ticket_id;

  UPDATE public.sessions
  SET payment_status = CASE WHEN _mode = 'refund' THEN 'refunded' ELSE 'voided' END
  WHERE ticket_id = p_ticket_id;

  PERFORM public.log_audit_event(
    CASE WHEN _mode = 'refund' THEN 'ticket_refunded' ELSE 'ticket_voided' END,
    'ticket', p_ticket_id,
    jsonb_build_object(
      'ticket_no', _t.ticket_no,
      'original_total_ils', _t.total_ils,
      'refund_amount_ils', _refund,
      'reason', _reason
    ),
    _t.tenant_id, _uid
  );

  RETURN jsonb_build_object(
    'ticket_id', p_ticket_id,
    'ticket_no', _t.ticket_no,
    'mode', _mode,
    'refund_amount_ils', _refund
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.restock_product(uuid, integer, numeric, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.adjust_stock(uuid, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_inventory_movements(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.restock_product(uuid, integer, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_movements(uuid, integer, integer) TO authenticated;