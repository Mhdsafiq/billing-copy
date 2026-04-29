-- ═══════════════════════════════════════════════════════════════════
--  IVA SMART BILLING — INDIVIDUAL SHOP DATABASE v5
--  Run this in EACH SHOP's OWN Supabase project
--  This creates ALL tables for one shop's billing data
--  NOTE: No shop_id needed — each shop has its own isolated DB
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. PRODUCTS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER UNIQUE,
    name TEXT,
    category_id INTEGER,
    category_name TEXT,
    gst_rate NUMERIC DEFAULT 0,
    product_code TEXT,
    price_type TEXT DEFAULT 'exclusive',
    price NUMERIC,
    cost_price NUMERIC DEFAULT 0,
    quantity NUMERIC,
    unit TEXT,
    barcode TEXT,
    expiry_date TEXT,
    image TEXT,
    default_discount NUMERIC DEFAULT 0,
    weight TEXT,
    brand TEXT,
    hsn_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_all" ON public.products;
CREATE POLICY "products_all" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 2. CATEGORIES TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    gst NUMERIC DEFAULT 0
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_all" ON public.categories;
CREATE POLICY "categories_all" ON public.categories FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 3. CUSTOMERS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER UNIQUE,
    name TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_all" ON public.customers;
CREATE POLICY "customers_all" ON public.customers FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 4. INVOICES TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER UNIQUE,
    bill_no INTEGER,
    bill_date TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    customer_id INTEGER,
    payment_mode TEXT,
    total_amount NUMERIC,
    is_cancelled BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_all" ON public.invoices;
CREATE POLICY "invoices_all" ON public.invoices FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 5. INVOICE ITEMS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER UNIQUE,
    invoice_id INTEGER,
    invoice_uuid UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id INTEGER,
    quantity INTEGER,
    price NUMERIC,
    gst_rate NUMERIC DEFAULT 0,
    gst_amount NUMERIC DEFAULT 0,
    discount_percent DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    hsn_code TEXT
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice_items_all" ON public.invoice_items;
CREATE POLICY "invoice_items_all" ON public.invoice_items FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 6. HELD BILLS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.held_bills (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER UNIQUE,
    label TEXT,
    cart_json TEXT,
    customer_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.held_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "held_bills_all" ON public.held_bills;
CREATE POLICY "held_bills_all" ON public.held_bills FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 7. OFFERS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.offers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    status INTEGER DEFAULT 1,
    buy_product_id INTEGER,
    buy_quantity INTEGER,
    free_product_id INTEGER,
    free_quantity INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "offers_all" ON public.offers;
CREATE POLICY "offers_all" ON public.offers FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 8. NOTIFICATIONS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER UNIQUE,
    type TEXT,
    title TEXT,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_all" ON public.notifications;
CREATE POLICY "notifications_all" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 9. SHOP SETTINGS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shop_settings (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT
);

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_settings_all" ON public.shop_settings;
CREATE POLICY "shop_settings_all" ON public.shop_settings FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 10. IDEMPOTENT MIGRATIONS (safe to re-run)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS hsn_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_discount NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS bill_no INTEGER;

ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS hsn_code TEXT;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 0;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS gst_amount NUMERIC DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────
-- 11. ENABLE REALTIME (for all shop tables)
-- ─────────────────────────────────────────────────────────────────
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE invoice_items;
ALTER PUBLICATION supabase_realtime ADD TABLE held_bills;
ALTER PUBLICATION supabase_realtime ADD TABLE offers;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE shop_settings;

-- ─────────────────────────────────────────────────────────────────
-- 12. RELOAD SCHEMA CACHE
-- ─────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

SELECT 'Individual Shop DB v5 Ready! All tables created with correct schema.' as status;
