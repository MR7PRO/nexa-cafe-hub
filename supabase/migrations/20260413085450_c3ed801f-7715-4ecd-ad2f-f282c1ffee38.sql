
-- Fix INSERT policies: replace WITH CHECK (true) with tenant_id enforcement

-- 1. expenses
DROP POLICY IF EXISTS "insert_expenses" ON public.expenses;
CREATE POLICY "insert_expenses" ON public.expenses
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- 2. tickets
DROP POLICY IF EXISTS "insert_tickets" ON public.tickets;
CREATE POLICY "insert_tickets" ON public.tickets
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- 3. sessions
DROP POLICY IF EXISTS "insert_sessions" ON public.sessions;
CREATE POLICY "insert_sessions" ON public.sessions
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- 4. customer_balances
DROP POLICY IF EXISTS "insert_balances" ON public.customer_balances;
CREATE POLICY "insert_balances" ON public.customer_balances
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- 5. customers
DROP POLICY IF EXISTS "insert_customers" ON public.customers;
CREATE POLICY "insert_customers" ON public.customers
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- 6. ticket_items
DROP POLICY IF EXISTS "insert_ticket_items" ON public.ticket_items;
CREATE POLICY "insert_ticket_items" ON public.ticket_items
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- 7. reservations
DROP POLICY IF EXISTS "insert_reservations" ON public.reservations;
CREATE POLICY "insert_reservations" ON public.reservations
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- 8. payments
DROP POLICY IF EXISTS "insert_payments" ON public.payments;
CREATE POLICY "insert_payments" ON public.payments
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- 9. audit_logs
DROP POLICY IF EXISTS "insert_audit_logs" ON public.audit_logs;
CREATE POLICY "insert_audit_logs" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- Fix role escalation: prevent admins from assigning super_admin role
DROP POLICY IF EXISTS "manage_roles_insert" ON public.user_roles;
CREATE POLICY "manage_roles_insert" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())
    AND role != 'super_admin'::app_role
  )
);

DROP POLICY IF EXISTS "manage_roles_update" ON public.user_roles;
CREATE POLICY "manage_roles_update" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_user_tenant_id(user_id) = get_user_tenant_id(auth.uid())
    AND role != 'super_admin'::app_role
  )
);
