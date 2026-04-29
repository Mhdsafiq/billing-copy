-- ═══════════════════════════════════════════════════════════════════
--  IVA SMART BILLING — GLOBAL CONTROL PLANE v5 FIX
--  Run this in GLOBAL Supabase: baawqrqihlhsrghvjlpx
--
--  FIX: Removes billing tables (products, invoices, customers, etc.)
--  from global DB. These tables belong ONLY in individual shop DBs.
--  Global DB is CONTROL PLANE only: shops, shop_stats, pairing_codes.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- STEP 1: DROP BILLING TABLES FROM GLOBAL (they don't belong here)
-- These tables without shop_id cause ALL shop data to mix together!
-- ─────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.invoice_items CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.invoice_items CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- STEP 2: ADMINS TABLE (unchanged)
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
-- STEP 3: SHOPS TABLE (Control Plane — NO billing data here)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shops (
    id TEXT PRIMARY KEY,
    -- Owner Info
    owner_name TEXT NOT NULL DEFAULT 'Owner',
    owner_email TEXT NOT NULL DEFAULT '',
    owner_phone TEXT DEFAULT 'N/A',
    mobile_number TEXT DEFAULT '',
    shop_email TEXT DEFAULT '',
    -- Store Info
    store_name TEXT DEFAULT 'My Store',
    name TEXT DEFAULT 'My Shop',
    -- Auth
    master_key TEXT NOT NULL DEFAULT 'owner123',
    hardware_id TEXT DEFAULT '',
    -- Software Control
    is_active BOOLEAN DEFAULT false,
    software_status TEXT DEFAULT 'pending_activation',
    ever_activated BOOLEAN DEFAULT false,
    -- Activation
    activation_requested BOOLEAN DEFAULT false,
    last_request_at TIMESTAMP WITH TIME ZONE,
    request_notes TEXT,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    -- Subscription
    is_paid BOOLEAN DEFAULT false,
    validity_start TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    validity_end TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '1 year'),
    payment_status TEXT DEFAULT 'unpaid',
    -- SaaS Multi-Tenancy (links to individual shop Supabase)
    shop_supabase_url TEXT,
    shop_supabase_key TEXT,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_login TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shops_all" ON public.shops;
CREATE POLICY "shops_all" ON public.shops FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- STEP 4: SHOP STATS (Snapshot from desktop — for mobile dashboard)
-- Only aggregate stats go here, NOT raw billing records
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
-- STEP 5: PAIRING CODES (for mobile app pairing handshake)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pairing_codes (
    id BIGSERIAL PRIMARY KEY,
    shop_id TEXT REFERENCES public.shops(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending',
    device_id TEXT,
    user_id TEXT
);

ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pairing_all" ON public.pairing_codes;
CREATE POLICY "pairing_all" ON public.pairing_codes FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- STEP 6: NOTIFICATIONS (Admin → Shop alerts only)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
    id BIGSERIAL PRIMARY KEY,
    shop_id TEXT REFERENCES public.shops(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'info',
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_all" ON public.notifications;
CREATE POLICY "notifications_all" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- STEP 7: REALTIME (Control plane tables ONLY — no billing tables)
-- ─────────────────────────────────────────────────────────────────
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE
    public.shops,
    public.shop_stats,
    public.pairing_codes,
    public.notifications;

-- ─────────────────────────────────────────────────────────────────
-- STEP 8: RELOAD SCHEMA CACHE
-- ─────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

SELECT 'Global Control Plane v5 Fixed! Billing tables removed from global DB.' as status;
