-- Fix overly permissive INSERT policy on tenants
DROP POLICY IF EXISTS "create_tenant" ON public.tenants;
CREATE POLICY "create_tenant" ON public.tenants
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_super_admin(auth.uid())
);