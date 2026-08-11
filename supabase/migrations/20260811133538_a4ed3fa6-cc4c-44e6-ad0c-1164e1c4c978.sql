-- 1. Remove PIN hash exposure entirely (feature unused in the app)
DROP FUNCTION IF EXISTS public.get_profile_pin_hash(uuid);
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin_hash;

-- 2. Signup: no hardcoded super admin, invitation required for joining a tenant
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id uuid;
  _code text;
  _invite record;
BEGIN
  _code := upper(btrim(COALESCE(NEW.raw_user_meta_data->>'invite_code', '')));

  IF _code <> '' THEN
    SELECT * INTO _invite
    FROM public.invitations
    WHERE code = _code
      AND is_active
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR COALESCE(used_count, 0) < max_uses)
    FOR UPDATE;

    IF _invite.id IS NULL THEN
      RAISE EXCEPTION 'كود الدعوة غير صالح';
    END IF;

    INSERT INTO public.profiles (id, name, tenant_id)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), _invite.tenant_id);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, CASE WHEN _invite.role IN ('manager', 'cashier') THEN _invite.role ELSE 'cashier'::app_role END);

    UPDATE public.invitations
    SET used_count = COALESCE(used_count, 0) + 1
    WHERE id = _invite.id;
  ELSE
    INSERT INTO public.tenants (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'cafe_name', NEW.raw_user_meta_data->>'name', NEW.email))
    RETURNING id INTO _tenant_id;

    INSERT INTO public.profiles (id, name, tenant_id)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), _tenant_id);

    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Role assignment: admins may only grant manager/cashier
DROP POLICY IF EXISTS manage_roles_insert ON public.user_roles;
CREATE POLICY manage_roles_insert ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())
    AND role IN ('manager'::app_role, 'cashier'::app_role)
  )
);

DROP POLICY IF EXISTS manage_roles_update ON public.user_roles;
CREATE POLICY manage_roles_update ON public.user_roles
FOR UPDATE TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())
    AND user_id <> auth.uid()
    AND role IN ('manager'::app_role, 'cashier'::app_role)
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())
    AND user_id <> auth.uid()
    AND role IN ('manager'::app_role, 'cashier'::app_role)
  )
);

-- 4. Explicit, admin-scoped DELETE policies
CREATE POLICY delete_customers ON public.customers
FOR DELETE TO authenticated
USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

CREATE POLICY delete_customer_balances ON public.customer_balances
FOR DELETE TO authenticated
USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

CREATE POLICY delete_loyalty_packages ON public.loyalty_packages
FOR DELETE TO authenticated
USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

CREATE POLICY delete_promotions ON public.promotions
FOR DELETE TO authenticated
USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

CREATE POLICY delete_rate_plans ON public.rate_plans
FOR DELETE TO authenticated
USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

CREATE POLICY delete_tickets ON public.tickets
FOR DELETE TO authenticated
USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

CREATE POLICY delete_payments ON public.payments
FOR DELETE TO authenticated
USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

GRANT DELETE ON public.customers, public.customer_balances, public.loyalty_packages,
  public.promotions, public.rate_plans, public.tickets, public.payments TO authenticated;

-- 5. Lock down SECURITY DEFINER function execution: no anon, no PUBLIC
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.prorettype = 'trigger'::regtype AS is_trigger
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF NOT r.is_trigger THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_user_tenant_id(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
REVOKE ALL ON FUNCTION public.next_ticket_no(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.compute_promotion_discount(uuid, uuid, numeric, text) FROM authenticated;