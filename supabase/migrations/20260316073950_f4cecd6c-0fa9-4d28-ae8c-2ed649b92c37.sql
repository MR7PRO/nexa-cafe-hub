
-- Invitations table for employee invite codes
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'cashier',
  created_by uuid REFERENCES auth.users(id),
  max_uses integer DEFAULT 10,
  used_count integer DEFAULT 0,
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage their own tenant invitations
CREATE POLICY "view_invitations" ON public.invitations
  FOR SELECT TO authenticated
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "insert_invitations" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR is_super_admin(auth.uid())
  );

CREATE POLICY "update_invitations" ON public.invitations
  FOR UPDATE TO authenticated
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "delete_invitations" ON public.invitations
  FOR DELETE TO authenticated
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'))
    OR is_super_admin(auth.uid())
  );

-- Allow anonymous users to read invite code for registration (limited fields via edge function)
-- We'll use an edge function to validate invites, so no anon policy needed

-- Add tenant_id trigger
CREATE TRIGGER set_invitation_tenant_id
  BEFORE INSERT ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
