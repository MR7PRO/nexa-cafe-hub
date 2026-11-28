CREATE TABLE public.sale_requests (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 operation text NOT NULL CHECK (operation IN ('pos','package')),
 payload jsonb NOT NULL,
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id, request_id)
);
GRANT ALL ON public.sale_requests TO service_role;
ALTER TABLE public.sale_requests ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.sale_requests IS 'Internal transactional retry ledger; no direct client access. Results and request identities are retained for safe replay.';

CREATE FUNCTION public.process_sale(p_items jsonb, p_payments jsonb, p_promotion_id uuid, p_manual_discount_ils numeric, p_customer_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _tenant uuid; _payload jsonb; _saved public.sale_requests%ROWTYPE; _result jsonb;
BEGIN
 IF _uid IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'معرّف الطلب وتسجيل الدخول مطلوبان'; END IF;
 SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
 IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;
 _payload := jsonb_build_object('items',p_items,'payments',p_payments,'promotion',p_promotion_id,'discount',p_manual_discount_ils,'customer',p_customer_id);
 INSERT INTO public.sale_requests(tenant_id,request_id,actor_id,operation,payload)
 VALUES (_tenant,p_request_id,_uid,'pos',_payload) ON CONFLICT DO NOTHING;
 SELECT * INTO _saved FROM public.sale_requests WHERE tenant_id=_tenant AND request_id=p_request_id FOR UPDATE;
 IF _saved.actor_id IS DISTINCT FROM _uid OR _saved.operation <> 'pos' OR _saved.payload IS DISTINCT FROM _payload THEN
  RAISE EXCEPTION 'معرّف الطلب مستخدم لعملية مختلفة';
 END IF;
 IF _saved.result IS NOT NULL THEN RETURN _saved.result; END IF;
 _result := public.process_sale(p_items,p_payments,p_promotion_id,p_manual_discount_ils,p_customer_id);
 UPDATE public.sale_requests SET result=_result WHERE tenant_id=_tenant AND request_id=p_request_id;
 RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.process_sale(jsonb,jsonb,uuid,numeric,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_sale(jsonb,jsonb,uuid,numeric,uuid,uuid) TO authenticated;

CREATE FUNCTION public.sell_loyalty_package(p_customer_id uuid, p_package_id uuid, p_payments jsonb, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _tenant uuid; _payload jsonb; _saved public.sale_requests%ROWTYPE; _result jsonb;
BEGIN
 IF _uid IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'معرّف الطلب وتسجيل الدخول مطلوبان'; END IF;
 SELECT tenant_id INTO _tenant FROM public.profiles WHERE id=_uid;
 IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;
 _payload := jsonb_build_object('customer',p_customer_id,'package',p_package_id,'payments',p_payments);
 INSERT INTO public.sale_requests(tenant_id,request_id,actor_id,operation,payload)
 VALUES (_tenant,p_request_id,_uid,'package',_payload) ON CONFLICT DO NOTHING;
 SELECT * INTO _saved FROM public.sale_requests WHERE tenant_id=_tenant AND request_id=p_request_id FOR UPDATE;
 IF _saved.actor_id IS DISTINCT FROM _uid OR _saved.operation <> 'package' OR _saved.payload IS DISTINCT FROM _payload THEN
  RAISE EXCEPTION 'معرّف الطلب مستخدم لعملية مختلفة';
 END IF;
 IF _saved.result IS NOT NULL THEN RETURN _saved.result; END IF;
 _result := public.sell_loyalty_package(p_customer_id,p_package_id,p_payments);
 UPDATE public.sale_requests SET result=_result WHERE tenant_id=_tenant AND request_id=p_request_id;
 RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.sell_loyalty_package(uuid,uuid,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_loyalty_package(uuid,uuid,jsonb,uuid) TO authenticated;

DO $repair$
DECLARE _sql text;
BEGIN
 _sql := pg_get_functiondef('public.void_ticket(uuid,text,text,numeric)'::regprocedure);
 IF position('FLOOR(_m.change_minutes * _ratio)' in _sql)=0 THEN RAISE EXCEPTION 'Unexpected refund definition'; END IF;
 _sql := replace(_sql,'FLOOR(_m.change_minutes * _ratio)','FLOOR(COALESCE(_before, 0) * _ratio)');
 EXECUTE _sql;
 _sql := pg_get_functiondef('public.compute_shift_close()'::regprocedure);
 IF position('IF current_user IN (''authenticated'',''anon'') THEN' in _sql)=0 THEN RAISE EXCEPTION 'Unexpected shift definition'; END IF;
 _sql := replace(_sql,'IF current_user IN (''authenticated'',''anon'') THEN','IF true THEN');
 EXECUTE _sql;
END $repair$;