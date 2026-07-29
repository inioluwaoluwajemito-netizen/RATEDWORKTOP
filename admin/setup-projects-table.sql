-- =========================================================================
-- RatedWorktops — Projects Table Setup Script (Supabase SQL)
-- =========================================================================
-- Run this script in Supabase Dashboard -> SQL Editor to ensure the
-- projects table exists with proper columns, RLS policies, and instant cache reload.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    stone_name TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns exist if table was previously created
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS stone_name TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Enable Row Level Security with full public access policy
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to projects" ON public.projects;
CREATE POLICY "Allow all access to projects" ON public.projects
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated access to projects" ON public.projects;
CREATE POLICY "Allow authenticated access to projects" ON public.projects
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Force PostgREST schema cache reload immediately
NOTIFY pgrst, 'reload schema';
