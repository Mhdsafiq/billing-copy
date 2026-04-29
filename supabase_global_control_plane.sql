-- ═══════════════════════════════════════════════════════════════════
--  IVA SMART BILLING — GLOBAL CONTROL PLANE + SHOP DATA SCHEMA
--  Run this ONCE in: baawqrqihlhsrghvjlpx Supabase SQL Editor
--  Safe to re-run: All statements are idempotent (no duplicate errors)
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. ADMINS TABLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.admins (email, password_hash)
VALUES ('admin@iva.com', 'admin123')
ON CONFLICT (email) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 2. SHOPS TABLE (Master Registry)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shops (
    id TEXT PRIMARY KEY,
    owner_name TEXT NOT NULL DEFAULT 'Owner',
    owner_email TEXT NOT NULL DEFAULT '',
    owner_phone TEXT DEFAULT 'N/A',
    store_name TEXT DEFAULT 'My Store',
    master_key TEXT NOT NULL DEFAULT '',

    -- Software Control
    is_active BOOLEAN DEFAULT false,
    software_status TEXT DEFAULT 'pending_activation',

    -- Activation
    activation_requested BOOLEAN DEFAULT false,
    last_request_at TIMESTAMP WITH TIME ZONE,
    request_notes TEXT,

    -- Subscription
    is_paid BOOLEAN DEFAULT false,
    validity_start TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    validity_end TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '1 year'),
    payment_status TEXT DEFAULT 'unpaid',

    -- SaaS Multi-Tenancy
    shop_supabase_url TEXT,
    shop_supabase_key TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_login TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Safe column additions (idempotent)
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS owner_phone TEXT DEFAULT 'N/A';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS store_name TEXT DEFAULT 'My Store';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_supabase_url TEXT;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_supabase_key TEXT;

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shops_all" ON public.shops;
CREATE POLICY "shops_all" ON public.shops FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 3. SHOP STATS (Mobile App Mirror)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shop_stats (
    shop_id TEXT PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
    stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shop_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stats_all" ON public.shop_stats;
CREATE POLICY "stats_all" ON public.shop_stats FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 4. PAIRING CODES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pairing_codes (
    id BIGSERIAL PRIMARY KEY,
    shop_id TEXT REFERENCES public.shops(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending'
);

ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pairing_all" ON public.pairing_codes;
CREATE POLICY "pairing_all" ON public.pairing_codes FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 5. PRODUCTS (Shop billing data — synced from desktop)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER,
    name TEXT,
    category_id INTEGER,
    category_name TEXT,
    price NUMERIC,
    cost_price NUMERIC DEFAULT 0,
    quantity NUMERIC DEFAULT 0,
    unit TEXT,
    barcode TEXT,
    expiry_date TEXT,
    image TEXT,
    gst_rate NUMERIC DEFAULT 0,
    price_type TEXT DEFAULT 'exclusive',
    product_code TEXT,
    default_discount NUMERIC DEFAULT 0,
    brand TEXT,
    weight TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_local_id_unique') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_local_id_unique UNIQUE (local_id);
  END IF;
END $$;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_all" ON public.products;
CREATE POLICY "products_all" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 6. CUSTOMERS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER,
    name TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_local_id_unique') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_local_id_unique UNIQUE (local_id);
  END IF;
END $$;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_all" ON public.customers;
CREATE POLICY "customers_all" ON public.customers FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 7. INVOICES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER,
    bill_no INTEGER,
    bill_date TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    customer_id INTEGER,
    payment_mode TEXT,
    total_amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_local_id_unique') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_local_id_unique UNIQUE (local_id);
  END IF;
END $$;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_all" ON public.invoices;
CREATE POLICY "invoices_all" ON public.invoices FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 8. INVOICE ITEMS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    local_id INTEGER,
    invoice_id INTEGER,
    invoice_uuid UUID,
    product_id INTEGER,
    quantity INTEGER,
    price NUMERIC,
    gst_rate NUMERIC DEFAULT 0,
    gst_amount NUMERIC DEFAULT 0,
    discount_percent NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_local_id_unique') THEN
    ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_local_id_unique UNIQUE (local_id);
  END IF;
END $$;

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice_items_all" ON public.invoice_items;
CREATE POLICY "invoice_items_all" ON public.invoice_items FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 9. CATEGORIES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
    id INTEGER PRIMARY KEY,
    name TEXT,
    gst NUMERIC DEFAULT 0
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_all" ON public.categories;
CREATE POLICY "categories_all" ON public.categories FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 10. REALTIME (Control plane tables only)
-- ─────────────────────────────────────────────────────────────────
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE
    public.shops,
    public.shop_stats,
    public.pairing_codes,
    public.products,
    public.invoices,
    public.invoice_items,
    public.customers,
    public.categories;

-- ─────────────────────────────────────────────────────────────────
-- 11. RELOAD SCHEMA CACHE
-- ─────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
