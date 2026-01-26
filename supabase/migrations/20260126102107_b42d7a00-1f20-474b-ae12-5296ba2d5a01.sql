-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'cashier');

-- Create device_type enum
CREATE TYPE public.device_type AS ENUM ('playstation', 'pc');

-- Create session_status enum
CREATE TYPE public.session_status AS ENUM ('running', 'paused', 'ended');

-- Create ticket_status enum
CREATE TYPE public.ticket_status AS ENUM ('open', 'paid', 'void');

-- Create payment_method enum
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'mixed');

-- Create item_type enum
CREATE TYPE public.item_type AS ENUM ('session', 'product');

-- Profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'cashier',
  UNIQUE (user_id, role)
);

-- Rate plans table
CREATE TABLE public.rate_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_per_hour_ils DECIMAL(10,2) NOT NULL,
  rounding_minutes INTEGER DEFAULT 1,
  min_charge_ils DECIMAL(10,2) DEFAULT 0,
  schedule_rules_json JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Devices table
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type device_type NOT NULL DEFAULT 'playstation',
  location TEXT,
  default_rate_plan_id UUID REFERENCES public.rate_plans(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions table
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  rate_plan_id UUID NOT NULL REFERENCES public.rate_plans(id),
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  paused_seconds INTEGER NOT NULL DEFAULT 0,
  pause_started_at TIMESTAMPTZ,
  status session_status NOT NULL DEFAULT 'running',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id),
  sell_price_ils DECIMAL(10,2) NOT NULL,
  cost_price_ils DECIMAL(10,2) DEFAULT 0,
  stock_qty INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no TEXT NOT NULL UNIQUE,
  status ticket_status NOT NULL DEFAULT 'open',
  created_by UUID REFERENCES auth.users(id),
  discount_ils DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_ils DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Ticket items table
CREATE TABLE public.ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  item_type item_type NOT NULL,
  ref_id UUID,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price_ils DECIMAL(10,2) NOT NULL,
  total_ils DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  amount_ils DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shifts table
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES auth.users(id),
  open_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  close_time TIMESTAMPTZ,
  opening_cash_ils DECIMAL(10,2) NOT NULL DEFAULT 0,
  closing_cash_ils DECIMAL(10,2),
  expected_cash_ils DECIMAL(10,2),
  difference_ils DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expenses table
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  amount_ils DECIMAL(10,2) NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function to check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- RLS Policies for user_roles (admin only management)
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for rate_plans
CREATE POLICY "All staff can view rate plans" ON public.rate_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Manager can manage rate plans" ON public.rate_plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for devices
CREATE POLICY "All staff can view devices" ON public.devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Manager can manage devices" ON public.devices FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for sessions
CREATE POLICY "All staff can view sessions" ON public.sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "All staff can create sessions" ON public.sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "All staff can update sessions" ON public.sessions FOR UPDATE TO authenticated USING (true);

-- RLS Policies for categories
CREATE POLICY "All staff can view categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Manager can manage categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for products
CREATE POLICY "All staff can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Manager can manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for tickets
CREATE POLICY "All staff can view tickets" ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "All staff can create tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "All staff can update tickets" ON public.tickets FOR UPDATE TO authenticated USING (true);

-- RLS Policies for ticket_items
CREATE POLICY "All staff can manage ticket items" ON public.ticket_items FOR ALL TO authenticated USING (true);

-- RLS Policies for payments
CREATE POLICY "All staff can manage payments" ON public.payments FOR ALL TO authenticated USING (true);

-- RLS Policies for shifts
CREATE POLICY "All staff can view own shifts" ON public.shifts FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "All staff can manage own shifts" ON public.shifts FOR ALL TO authenticated USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for expenses
CREATE POLICY "All staff can view expenses" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "All staff can create expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin/Manager can manage expenses" ON public.expenses FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- RLS Policies for audit_logs
CREATE POLICY "Admin/Manager can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "All staff can create audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Function to create profile and assign role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
  
  -- First user gets admin role, others get cashier
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cashier');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert some default data
INSERT INTO public.rate_plans (name, price_per_hour_ils, rounding_minutes, min_charge_ils) VALUES
  ('عادي', 15.00, 5, 5.00),
  ('VIP', 25.00, 5, 10.00),
  ('ليلي', 10.00, 10, 5.00);

INSERT INTO public.categories (name) VALUES
  ('مشروبات'),
  ('وجبات خفيفة'),
  ('حلويات');

INSERT INTO public.products (name, category_id, sell_price_ils, cost_price_ils, stock_qty) 
SELECT 'إندومي', id, 8.00, 4.00, 50 FROM public.categories WHERE name = 'وجبات خفيفة';

INSERT INTO public.products (name, category_id, sell_price_ils, cost_price_ils, stock_qty) 
SELECT 'بيبسي', id, 5.00, 2.50, 100 FROM public.categories WHERE name = 'مشروبات';

INSERT INTO public.products (name, category_id, sell_price_ils, cost_price_ils, stock_qty) 
SELECT 'شيبس', id, 4.00, 2.00, 80 FROM public.categories WHERE name = 'وجبات خفيفة';

INSERT INTO public.products (name, category_id, sell_price_ils, cost_price_ils, stock_qty) 
SELECT 'ماء', id, 3.00, 1.00, 200 FROM public.categories WHERE name = 'مشروبات';

-- Insert sample devices
INSERT INTO public.devices (name, type, location, default_rate_plan_id)
SELECT 'PS1', 'playstation', 'الصالة الرئيسية', id FROM public.rate_plans WHERE name = 'عادي';

INSERT INTO public.devices (name, type, location, default_rate_plan_id)
SELECT 'PS2', 'playstation', 'الصالة الرئيسية', id FROM public.rate_plans WHERE name = 'عادي';

INSERT INTO public.devices (name, type, location, default_rate_plan_id)
SELECT 'PS3', 'playstation', 'VIP', id FROM public.rate_plans WHERE name = 'VIP';

INSERT INTO public.devices (name, type, location, default_rate_plan_id)
SELECT 'PC1', 'pc', 'الصالة الرئيسية', id FROM public.rate_plans WHERE name = 'عادي';

INSERT INTO public.devices (name, type, location, default_rate_plan_id)
SELECT 'PC2', 'pc', 'الصالة الرئيسية', id FROM public.rate_plans WHERE name = 'عادي';

-- Enable realtime for devices and sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;