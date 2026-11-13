-- Tickets / items only written through server RPCs
DROP POLICY IF EXISTS insert_tickets ON public.tickets;
DROP POLICY IF EXISTS update_tickets ON public.tickets;
DROP POLICY IF EXISTS insert_ticket_items ON public.ticket_items;
DROP POLICY IF EXISTS update_ticket_items ON public.ticket_items;

-- Prevent users moving their profile to another tenant
CREATE OR REPLACE FUNCTION public.prevent_profile_tenant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     AND auth.uid() IS NOT NULL
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'لا يمكن تغيير المقهى المرتبط بالحساب';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'غير مسموح'; END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_tenant_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_prevent_profile_tenant_change ON public.profiles;
CREATE TRIGGER trg_prevent_profile_tenant_change BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_tenant_change();
DROP POLICY IF EXISTS update_profile ON public.profiles;
CREATE POLICY update_profile ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND tenant_id IS NOT DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()));

-- Role/tenant lookups only for self, same tenant, super admin or server context
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.tenant_id FROM public.profiles p
  WHERE p.id = _user_id
    AND (auth.uid() IS NULL OR _user_id = auth.uid()
         OR p.tenant_id = (SELECT c.tenant_id FROM public.profiles c WHERE c.id = auth.uid())
         OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'super_admin'))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
      AND (auth.uid() IS NULL OR _user_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.profiles a JOIN public.profiles b ON a.tenant_id = b.tenant_id
                      WHERE a.id = auth.uid() AND b.id = _user_id)
           OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'super_admin'))
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT ur.role FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND (auth.uid() IS NULL OR _user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.profiles a JOIN public.profiles b ON a.tenant_id = b.tenant_id
                    WHERE a.id = auth.uid() AND b.id = _user_id)
         OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'super_admin'))
  LIMIT 1
$$;

-- Avatars: no anonymous listing; public URLs still work for the public bucket
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Users can read their own avatar files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);