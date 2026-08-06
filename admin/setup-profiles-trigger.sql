-- =========================================================================
-- RatedWorktops — Auth & Profiles Sync & Admin User Deletion Script (Supabase SQL)
-- =========================================================================
-- Run this script in Supabase Dashboard -> SQL Editor to ensure:
-- 1. All existing auth.users are backfilled into public.profiles
-- 2. New auth.users signups automatically create rows in public.profiles
-- 3. Admins can call delete_user_completely(user_id) to delete users from
--    both auth.users and public.profiles simultaneously.
-- =========================================================================

-- 1. Ensure public.profiles table exists with all necessary columns
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    full_name TEXT,
    name TEXT,
    plan TEXT DEFAULT 'Free',
    credits INT DEFAULT 0,
    visualisations INT DEFAULT 0,
    downloads INT DEFAULT 0,
    shares INT DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure existing table column default for credits is set to 0
ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 0;

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on profiles" ON public.profiles;
CREATE POLICY "Allow public read access on profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all access on profiles" ON public.profiles;
CREATE POLICY "Allow all access on profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

-- 2. Trigger function to automatically insert a profile when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_credits INT := 0;
  credits_enabled BOOLEAN := true;
BEGIN
  -- Read current admin-configured credit settings from public.settings (id=1)
  SELECT 
    COALESCE(free_credits_count, (data->>'free_credits_count')::int, (data->>'freeCreditsCount')::int, 0),
    COALESCE(free_credits_enabled, (data->>'free_credits_enabled')::boolean, (data->>'freeCreditsEnabled')::boolean, true)
  INTO default_credits, credits_enabled
  FROM public.settings
  WHERE id = 1
  LIMIT 1;

  IF credits_enabled IS FALSE THEN
    default_credits := 0;
  END IF;

  IF default_credits IS NULL THEN
    default_credits := 0;
  END IF;

  INSERT INTO public.profiles (id, email, name, full_name, plan, credits, status, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'Free',
    default_credits,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Function to allow admins to delete a user from auth.users AND public.profiles via RPC
CREATE OR REPLACE FUNCTION public.delete_user_completely(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Backfill existing auth.users into public.profiles if any are missing
INSERT INTO public.profiles (id, email, name, full_name, plan, credits, status, created_at, updated_at)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
  'Free',
  10,
  'active',
  created_at,
  NOW()
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Force PostgREST schema cache reload immediately
NOTIFY pgrst, 'reload schema';
