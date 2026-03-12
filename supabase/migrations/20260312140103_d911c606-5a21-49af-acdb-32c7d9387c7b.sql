
-- Customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All staff can view customers" ON public.customers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "All staff can create customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admin/Manager can manage customers" ON public.customers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Loyalty packages definition
CREATE TABLE public.loyalty_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  hours_included INTEGER NOT NULL,
  bonus_hours INTEGER NOT NULL DEFAULT 0,
  price_ils NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All staff can view loyalty packages" ON public.loyalty_packages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Manager can manage loyalty packages" ON public.loyalty_packages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Customer loyalty balance tracking
CREATE TABLE public.customer_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  package_id UUID REFERENCES public.loyalty_packages(id) NOT NULL,
  remaining_minutes INTEGER NOT NULL,
  total_minutes INTEGER NOT NULL,
  purchased_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sold_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All staff can view balances" ON public.customer_balances
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "All staff can create balances" ON public.customer_balances
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "All staff can update balances" ON public.customer_balances
  FOR UPDATE TO authenticated USING (true);

-- Index for fast customer lookup
CREATE INDEX idx_customers_phone ON public.customers(phone);
CREATE INDEX idx_customer_balances_customer ON public.customer_balances(customer_id);
