-- =========================================================================
-- RatedWorktops — Settings Table Setup Script (Supabase SQL)
-- =========================================================================
-- Run this script in Supabase Dashboard -> SQL Editor to ensure the
-- settings table exists with all standard snake_case and camelCase columns
-- and open access permissions.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.settings (
    id BIGINT PRIMARY KEY DEFAULT 1,
    free_credits_enabled BOOLEAN DEFAULT true,
    subscriptions_enabled BOOLEAN DEFAULT true,
    free_credits_count INT DEFAULT 10,
    monthly_price NUMERIC(10,2) DEFAULT 9.99,
    monthly_credits INT DEFAULT 100,
    annual_price NUMERIC(10,2) DEFAULT 89.99,
    annual_credits INT DEFAULT 1500,
    temp_storage_hours INT DEFAULT 48,
    max_saved_projects INT DEFAULT 2,

    -- Also add camelCase columns for full schema compatibility
    "freeCreditsEnabled" BOOLEAN DEFAULT true,
    "subscriptionsEnabled" BOOLEAN DEFAULT true,
    "freeCreditsCount" INT DEFAULT 10,
    "monthlyPrice" NUMERIC(10,2) DEFAULT 9.99,
    "monthlyCredits" INT DEFAULT 100,
    "annualPrice" NUMERIC(10,2) DEFAULT 89.99,
    "annualCredits" INT DEFAULT 1500,
    "tempStorageHours" INT DEFAULT 48,
    "maxSavedProjects" INT DEFAULT 2,

    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns are added if table existed previously
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS free_credits_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS subscriptions_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS free_credits_count INT DEFAULT 10;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS monthly_price NUMERIC(10,2) DEFAULT 9.99;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS monthly_credits INT DEFAULT 100;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS annual_price NUMERIC(10,2) DEFAULT 89.99;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS annual_credits INT DEFAULT 1500;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS temp_storage_hours INT DEFAULT 48;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS max_saved_projects INT DEFAULT 2;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "freeCreditsEnabled" BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "subscriptionsEnabled" BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "freeCreditsCount" INT DEFAULT 10;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "monthlyPrice" NUMERIC(10,2) DEFAULT 9.99;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "monthlyCredits" INT DEFAULT 100;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "annualPrice" NUMERIC(10,2) DEFAULT 89.99;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "annualCredits" INT DEFAULT 1500;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "tempStorageHours" INT DEFAULT 48;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "maxSavedProjects" INT DEFAULT 2;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;

-- Ensure row 1 exists
INSERT INTO public.settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Disable RLS & Grant full permissions so upserts never fail
ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.settings TO anon;
GRANT ALL ON TABLE public.settings TO authenticated;
GRANT ALL ON TABLE public.settings TO service_role;

-- Force PostgREST schema cache reload immediately
NOTIFY pgrst, 'reload schema';
