-- ══════════════════════════════════════════════════════════════════════════════
-- 🚨 CRITICAL: YOU MUST COPY AND RUN THIS ENTIRE SCRIPT IN YOUR SUPABASE SQL EDITOR!
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. FIX PRODUCTS TABLE
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS hsn_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT 'exclusive';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_discount NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;

-- DE-DUPLICATE PRODUCTS BEFORE ADDING CONSTRAINT
DELETE FROM public.products a USING public.products b 
WHERE a.id < b.id AND a.shop_id = b.shop_id AND a.local_id = b.local_id;

-- Ensure unique constraint for products sync
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_shop_local_unique') THEN
        ALTER TABLE public.products ADD CONSTRAINT products_shop_local_unique UNIQUE (shop_id, local_id);
    END IF;
END $$;

-- 2. FIX INVOICES TABLE
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS bill_date TEXT;

-- DE-DUPLICATE INVOICES BEFORE ADDING CONSTRAINT
DELETE FROM public.invoices a USING public.invoices b 
WHERE a.id < b.id AND a.shop_id = b.shop_id AND a.local_id = b.local_id;

-- Ensure unique constraint for invoices sync
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_shop_local_unique') THEN
        ALTER TABLE public.invoices ADD CONSTRAINT invoices_shop_local_unique UNIQUE (shop_id, local_id);
    END IF;
END $$;

-- 3. FIX SHOPS TABLE
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS gst_number TEXT;

-- 4. RELOAD POSTGREST CACHE
NOTIFY pgrst, 'reload schema';
