CREATE TRIGGER set_tenant_id_invitations
BEFORE INSERT ON public.invitations
FOR EACH ROW
EXECUTE FUNCTION public.set_tenant_id();