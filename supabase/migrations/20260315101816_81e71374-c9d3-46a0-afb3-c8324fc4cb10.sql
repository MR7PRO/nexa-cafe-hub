
-- Create tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Add tenant_id columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_items ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.loyalty_packages ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.customer_balances ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.rate_plans ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Helper functions
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM public.profiles WHERE id = _user_id LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin') $$;

-- Auto-set tenant_id trigger
CREATE OR REPLACE FUNCTION public.set_tenant_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    NEW.tenant_id := get_user_tenant_id(auth.uid());
  ELSIF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := get_user_tenant_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers
DO $$ 
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'devices','products','categories','customers','expenses','tickets',
    'ticket_items','payments','sessions','shifts','reservations',
    'promotions','loyalty_packages','customer_balances','rate_plans',
    'settings','audit_logs'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_%s ON public.%I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER set_tenant_id_%s BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION set_tenant_id()', tbl, tbl);
  END LOOP;
END $$;

-- Drop old policies
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin/Manager can manage devices" ON public.devices;
DROP POLICY IF EXISTS "All staff can view devices" ON public.devices;
DROP POLICY IF EXISTS "Admin/Manager can manage products" ON public.products;
DROP POLICY IF EXISTS "All staff can view products" ON public.products;
DROP POLICY IF EXISTS "Admin/Manager can manage categories" ON public.categories;
DROP POLICY IF EXISTS "All staff can view categories" ON public.categories;
DROP POLICY IF EXISTS "Admin/Manager can manage customers" ON public.customers;
DROP POLICY IF EXISTS "All staff can create customers" ON public.customers;
DROP POLICY IF EXISTS "All staff can view customers" ON public.customers;
DROP POLICY IF EXISTS "Admin/Manager can manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "All staff can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "All staff can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "All staff can create tickets" ON public.tickets;
DROP POLICY IF EXISTS "All staff can update tickets" ON public.tickets;
DROP POLICY IF EXISTS "All staff can view tickets" ON public.tickets;
DROP POLICY IF EXISTS "All staff can manage ticket items" ON public.ticket_items;
DROP POLICY IF EXISTS "All staff can manage payments" ON public.payments;
DROP POLICY IF EXISTS "All staff can create sessions" ON public.sessions;
DROP POLICY IF EXISTS "All staff can update sessions" ON public.sessions;
DROP POLICY IF EXISTS "All staff can view sessions" ON public.sessions;
DROP POLICY IF EXISTS "All staff can manage own shifts" ON public.shifts;
DROP POLICY IF EXISTS "All staff can view own shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admin/Manager can delete reservations" ON public.reservations;
DROP POLICY IF EXISTS "All staff can create reservations" ON public.reservations;
DROP POLICY IF EXISTS "All staff can update reservations" ON public.reservations;
DROP POLICY IF EXISTS "All staff can view reservations" ON public.reservations;
DROP POLICY IF EXISTS "Admin/Manager can manage promotions" ON public.promotions;
DROP POLICY IF EXISTS "All staff can view promotions" ON public.promotions;
DROP POLICY IF EXISTS "Admin/Manager can manage loyalty packages" ON public.loyalty_packages;
DROP POLICY IF EXISTS "All staff can view loyalty packages" ON public.loyalty_packages;
DROP POLICY IF EXISTS "All staff can create balances" ON public.customer_balances;
DROP POLICY IF EXISTS "All staff can update balances" ON public.customer_balances;
DROP POLICY IF EXISTS "All staff can view balances" ON public.customer_balances;
DROP POLICY IF EXISTS "Admin/Manager can manage rate plans" ON public.rate_plans;
DROP POLICY IF EXISTS "All staff can view rate plans" ON public.rate_plans;
DROP POLICY IF EXISTS "Admins can manage settings" ON public.settings;
DROP POLICY IF EXISTS "All staff can view settings" ON public.settings;
DROP POLICY IF EXISTS "Admin/Manager can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "All staff can create audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;

-- New tenant-scoped policies

-- tenants
CREATE POLICY "view_tenant" ON public.tenants FOR SELECT TO authenticated
  USING (id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "create_tenant" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "update_tenant" ON public.tenants FOR UPDATE TO authenticated
  USING ((id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin')) OR is_super_admin(auth.uid()));

-- profiles
CREATE POLICY "insert_profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "update_profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY "view_profiles" ON public.profiles FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()) OR id = auth.uid());

-- user_roles
CREATE POLICY "view_roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin') AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())));
CREATE POLICY "manage_roles_update" ON public.user_roles FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin') AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())));
CREATE POLICY "manage_roles_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin') AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())));
CREATE POLICY "manage_roles_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin') AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())));

-- devices
CREATE POLICY "view_devices" ON public.devices FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_devices" ON public.devices FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR is_super_admin(auth.uid()));
CREATE POLICY "update_devices" ON public.devices FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));
CREATE POLICY "delete_devices" ON public.devices FOR DELETE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));

-- products
CREATE POLICY "view_products" ON public.products FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR is_super_admin(auth.uid()));
CREATE POLICY "update_products" ON public.products FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));

-- categories
CREATE POLICY "view_categories" ON public.categories FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_categories" ON public.categories FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR is_super_admin(auth.uid()));
CREATE POLICY "update_categories" ON public.categories FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));

-- customers
CREATE POLICY "view_customers" ON public.customers FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_customers" ON public.customers FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));

-- expenses
CREATE POLICY "view_expenses" ON public.expenses FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_expenses" ON public.expenses FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));

-- tickets
CREATE POLICY "view_tickets" ON public.tickets FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_tickets" ON public.tickets FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

-- ticket_items
CREATE POLICY "view_ticket_items" ON public.ticket_items FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_ticket_items" ON public.ticket_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_ticket_items" ON public.ticket_items FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "delete_ticket_items" ON public.ticket_items FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

-- payments
CREATE POLICY "view_payments" ON public.payments FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_payments" ON public.payments FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

-- sessions
CREATE POLICY "view_sessions" ON public.sessions FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_sessions" ON public.sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_sessions" ON public.sessions FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

-- shifts
CREATE POLICY "view_shifts" ON public.shifts FOR SELECT TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (employee_id = auth.uid() OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_shifts" ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR is_super_admin(auth.uid()));
CREATE POLICY "update_shifts" ON public.shifts FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (employee_id = auth.uid() OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));

-- reservations
CREATE POLICY "view_reservations" ON public.reservations FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_reservations" ON public.reservations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_reservations" ON public.reservations FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "delete_reservations" ON public.reservations FOR DELETE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));

-- promotions
CREATE POLICY "view_promotions" ON public.promotions FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_promotions" ON public.promotions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR is_super_admin(auth.uid()));
CREATE POLICY "update_promotions" ON public.promotions FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));

-- loyalty_packages
CREATE POLICY "view_loyalty_packages" ON public.loyalty_packages FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_loyalty_packages" ON public.loyalty_packages FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR is_super_admin(auth.uid()));
CREATE POLICY "update_loyalty_packages" ON public.loyalty_packages FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));

-- customer_balances
CREATE POLICY "view_balances" ON public.customer_balances FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_balances" ON public.customer_balances FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_balances" ON public.customer_balances FOR UPDATE TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

-- rate_plans
CREATE POLICY "view_rate_plans" ON public.rate_plans FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_rate_plans" ON public.rate_plans FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR is_super_admin(auth.uid()));
CREATE POLICY "update_rate_plans" ON public.rate_plans FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));

-- settings
CREATE POLICY "view_settings" ON public.settings FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "manage_settings_insert" ON public.settings FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid()));
CREATE POLICY "manage_settings_update" ON public.settings FOR UPDATE TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin')) OR is_super_admin(auth.uid()));

-- audit_logs
CREATE POLICY "view_audit_logs" ON public.audit_logs FOR SELECT TO authenticated
  USING ((tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) OR is_super_admin(auth.uid()));
CREATE POLICY "insert_audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Update handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _invite_tenant_id uuid;
BEGIN
  _invite_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  
  IF NEW.email = 'ayham400700@gmail.com' THEN
    INSERT INTO public.tenants (name) VALUES ('NexaCafe Admin')
    RETURNING id INTO _tenant_id;
    INSERT INTO public.profiles (id, name, tenant_id)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'أيهم'), _tenant_id);
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSIF _invite_tenant_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, name, tenant_id)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), _invite_tenant_id);
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cashier');
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
$$;
