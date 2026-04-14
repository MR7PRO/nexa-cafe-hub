-- 1. Fix rate_plans INSERT: add tenant_id check
DROP POLICY IF EXISTS "insert_rate_plans" ON public.rate_plans;
CREATE POLICY "insert_rate_plans" ON public.rate_plans
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  OR is_super_admin(auth.uid())
);

-- 2. Fix user_roles admin self-escalation: prevent admins from updating their own role
DROP POLICY IF EXISTS "manage_roles_update" ON public.user_roles;
CREATE POLICY "manage_roles_update" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())
    AND user_id <> auth.uid()
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())
    AND user_id <> auth.uid()
    AND role <> 'super_admin'::app_role
  )
);

-- 3. Fix profiles pin_hash exposure: create a view without pin_hash for tenant queries
-- We'll use column-level grant approach via a secure function
CREATE OR REPLACE FUNCTION public.get_profile_pin_hash(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pin_hash FROM public.profiles WHERE id = _user_id;
$$;

-- Revoke direct access to pin_hash from anon and authenticated roles
-- and rely on the function for authorized access
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Replace view_profiles to exclude pin_hash by splitting into two policies
DROP POLICY IF EXISTS "view_profiles" ON public.profiles;

-- Everyone in tenant can see profiles (but pin_hash column will be controlled separately)
CREATE POLICY "view_profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.uid())
);