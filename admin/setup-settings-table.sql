-- =========================================================================
-- RatedWorktops — Settings Table Setup Script (Supabase SQL)
-- =========================================================================
-- Run this script in Supabase Dashboard -> SQL Editor to ensure the
-- settings table exists with all standard snake_case and camelCase columns.
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

-- Ensure row 1 exists
INSERT INTO public.settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security & Allow Public Read Access
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public settings are viewable by everyone" ON public.settings;
CREATE POLICY "Public settings are viewable by everyone" ON public.settings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Settings are editable by service role or authenticated users" ON public.settings;
CREATE POLICY "Settings are editable by service role or authenticated users" ON public.settings
    FOR ALL USING (true);
