CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_phone_norm_uniq
  ON public.customers (tenant_id, public.normalize_phone(phone))
  WHERE public.normalize_phone(phone) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.find_or_create_customer(p_name text, p_phone text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid(); _tenant uuid;
  _phone text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  _name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _uid;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'لا يوجد مقهى مرتبط بالحساب'; END IF;
  IF _name IS NULL AND public.normalize_phone(_phone) IS NULL THEN RAISE EXCEPTION 'اسم أو رقم الزبون مطلوب'; END IF;
  IF public.normalize_phone(_phone) IS NOT NULL THEN
    SELECT id INTO _id FROM public.customers
     WHERE tenant_id = _tenant AND public.normalize_phone(phone) = public.normalize_phone(_phone)
     ORDER BY created_at LIMIT 1;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  ELSE
    _phone := NULL;
    SELECT id INTO _id FROM public.customers
     WHERE tenant_id = _tenant AND public.normalize_phone(phone) IS NULL AND lower(name) = lower(_name)
     ORDER BY created_at LIMIT 1;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;
  BEGIN
    INSERT INTO public.customers (name, phone, created_by, tenant_id)
    VALUES (COALESCE(_name, _phone), _phone, _uid, _tenant) RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    -- concurrent insert won the race: return the existing customer
    SELECT id INTO _id FROM public.customers
     WHERE tenant_id = _tenant AND public.normalize_phone(phone) = public.normalize_phone(_phone)
     ORDER BY created_at LIMIT 1;
  END;
  RETURN _id;
END $function$;
REVOKE ALL ON FUNCTION public.find_or_create_customer(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_or_create_customer(text, text) TO authenticated;