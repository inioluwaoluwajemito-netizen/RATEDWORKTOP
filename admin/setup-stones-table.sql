-- =========================================================================
-- RatedWorktops — Brands & Colours Tables Setup Script (Supabase SQL)
-- =========================================================================
-- Run this script in Supabase Dashboard -> SQL Editor to ensure the
-- brands and colours tables exist with TEXT keys, image_url & finish columns,
-- and full public RLS permissions.
-- =========================================================================

-- 1. Create Brands Table
CREATE TABLE IF NOT EXISTS public.brands (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'Quartz',
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Colours Table
CREATE TABLE IF NOT EXISTS public.colours (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    brand_id TEXT,
    brand_name TEXT,
    name TEXT NOT NULL,
    sku TEXT,
    finish TEXT DEFAULT 'Polished',
    texture TEXT DEFAULT 'marble',
    image_url TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns exist if tables were created previously
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Quartz';
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

ALTER TABLE public.colours ADD COLUMN IF NOT EXISTS brand_id TEXT;
ALTER TABLE public.colours ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE public.colours ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.colours ADD COLUMN IF NOT EXISTS finish TEXT DEFAULT 'Polished';
ALTER TABLE public.colours ADD COLUMN IF NOT EXISTS texture TEXT DEFAULT 'marble';
ALTER TABLE public.colours ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.colours ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

-- Enable Row Level Security with full public access policies
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to brands" ON public.brands;
CREATE POLICY "Allow all access to brands" ON public.brands
    FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to colours" ON public.colours;
CREATE POLICY "Allow all access to colours" ON public.colours
    FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated access to brands" ON public.brands;
CREATE POLICY "Allow authenticated access to brands" ON public.brands
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated access to colours" ON public.colours;
CREATE POLICY "Allow authenticated access to colours" ON public.colours
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Force PostgREST schema cache reload immediately
NOTIFY pgrst, 'reload schema';
