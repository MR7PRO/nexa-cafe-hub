-- Create settings table for app-wide configuration
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- All staff can view settings
CREATE POLICY "All staff can view settings" ON public.settings FOR SELECT TO authenticated USING (true);

-- Only admins can manage settings
CREATE POLICY "Admins can manage settings" ON public.settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Insert default settings
INSERT INTO public.settings (key, value) VALUES
('discount_limits', '{"max_discount_percent": 20, "require_pin_above": 10}'),
('receipt_template', '{"header": "نيكسا كافيه", "footer": "شكراً لزيارتكم", "show_logo": true, "show_cashier": true}');