-- ═══════════════════════════════════════════════════════════════════
--  SUPABASE FULL SETUP — SaaS CONTROL PLANE (Main Database)
--  Purpose: Global shop management, Admin Auth, Validity enforcement
--  Location: YOUR MAIN SUPABASE PROJECT (management project)
-- ═══════════════════════════════════════════════════════════════════

-- 1. ADMINS TABLE (For Admin Dashboard Access)
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Initial Admin
INSERT INTO public.admins (email, password_hash) 
VALUES ('admin@iva.com', 'admin123')
ON CONFLICT (email) DO NOTHING;

-- 2. SHOPS TABLE (The Master List)
CREATE TABLE IF NOT EXISTS public.shops (
    id TEXT PRIMARY KEY, -- "shop-80536bbc" etc
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    owner_phone TEXT NOT NULL,
    store_name TEXT NOT NULL,
    master_key TEXT NOT NULL, -- The 6-digit key for initial mobile login
    
    -- Software Control
    is_active BOOLEAN DEFAULT false, 
    software_status TEXT DEFAULT 'pending_activation', -- 'active', 'deactivated', 'expired'
    
    -- Subscription Tracking
    is_paid BOOLEAN DEFAULT false,
    validity_start TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    validity_end TIMESTAMP WITH TIME ZONE NOT NULL,
    payment_status TEXT DEFAULT 'unpaid', -- 'paid', 'unpaid', 'grace_period'
    
    -- SaaS Multi-Tenancy (Data Plane Connection)
    shop_supabase_url TEXT,
    shop_supabase_key TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_login TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. SHOP STATS (Mirrored analytics for Mobile Dashboard)
CREATE TABLE IF NOT EXISTS public.shop_stats (
    shop_id TEXT PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
    stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. PAIRING CODES (Temporary 6-digit codes for mobile linking)
CREATE TABLE IF NOT EXISTS public.pairing_codes (
    id BIGSERIAL PRIMARY KEY,
    shop_id TEXT REFERENCES public.shops(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending' -- 'pending', 'used', 'expired'
);

-- Enable RLS
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public shops access" ON public.shops;
CREATE POLICY "Public shops access" ON public.shops FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.shop_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public stats access" ON public.shop_stats;
CREATE POLICY "Public stats access" ON public.shop_stats FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public pairing access" ON public.pairing_codes;
CREATE POLICY "Public pairing access" ON public.pairing_codes FOR ALL USING (true) WITH CHECK (true);

-- 6. ENABLE REALTIME REPLICATION
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE shops;
ALTER PUBLICATION supabase_realtime ADD TABLE pairing_codes;
ALTER PUBLICATION supabase_realtime ADD TABLE shop_stats;

NOTIFY pgrst, 'reload schema';
