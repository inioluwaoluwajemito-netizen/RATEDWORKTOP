-- =========================================================================
-- RatedWorktops — Auth & Profiles Sync (Google OAuth & Email Support)
-- =========================================================================
-- Run this script in Supabase Dashboard -> SQL Editor
-- This ensures:
-- 1. Full compatibility for both NEW and EXISTING leads logging in with Google or Email.
-- 2. Automatic profile creation with default credits & extracted metadata (name, avatar, email).
-- 3. Non-destructive conflict handling (existing users keep their credits, plans & history).
-- 4. Full RLS policies for smooth client and admin access.
-- =========================================================================

-- 1. Ensure public.profiles table exists with all necessary columns
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    name TEXT,
    avatar_url TEXT,
    plan TEXT DEFAULT 'Free',
    credits INT DEFAULT 10,
    visualisations INT DEFAULT 0,
    downloads INT DEFAULT 0,
    shares INT DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist in case table was created with earlier schema
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'Free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits INT DEFAULT 10;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visualisations INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS downloads INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shares INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Setup RLS Policies for Profiles
DROP POLICY IF EXISTS "Allow public read access on profiles" ON public.profiles;
CREATE POLICY "Allow public read access on profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert on profiles" ON public.profiles;
CREATE POLICY "Allow authenticated insert on profiles" ON public.profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update on profiles" ON public.profiles;
CREATE POLICY "Allow authenticated update on profiles" ON public.profiles FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access on profiles" ON public.profiles;
CREATE POLICY "Allow all access on profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

-- 3. Robust Trigger Function for New & Existing Leads (Google OAuth & Email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_credits INT := 10;
  credits_enabled BOOLEAN := true;
  extracted_name TEXT;
  extracted_avatar TEXT;
BEGIN
  -- Read starter credit settings from public.settings (id=1) if configured
  BEGIN
    SELECT 
      COALESCE(free_credits_count, (data->>'free_credits_count')::int, (data->>'freeCreditsCount')::int, 10),
      COALESCE(free_credits_enabled, (data->>'free_credits_enabled')::boolean, (data->>'freeCreditsEnabled')::boolean, true)
    INTO default_credits, credits_enabled
    FROM public.settings
    WHERE id = 1
    LIMIT 1;

    IF credits_enabled IS FALSE THEN
      default_credits := 0;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    default_credits := 10;
  END;

  IF default_credits IS NULL THEN
    default_credits := 10;
  END IF;

  -- Extract name from Google metadata or email fallback
  extracted_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'user_name',
    split_part(NEW.email, '@', 1),
    'Valued Lead'
  );

  -- Extract avatar / profile picture from Google metadata
  extracted_avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture',
    ''
  );

  -- Insert profile for new user, or gracefully sync metadata for existing user without resetting credits
  INSERT INTO public.profiles (
    id,
    email,
    name,
    full_name,
    avatar_url,
    plan,
    credits,
    visualisations,
    downloads,
    shares,
    status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    extracted_name,
    extracted_name,
    extracted_avatar,
    'Free',
    default_credits,
    0,
    0,
    0,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    avatar_url = CASE 
      WHEN EXCLUDED.avatar_url IS NOT NULL AND EXCLUDED.avatar_url <> '' THEN EXCLUDED.avatar_url 
      ELSE public.profiles.avatar_url 
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Admin RPC to completely remove user if needed (Drop first to avoid return type conflict)
DROP FUNCTION IF EXISTS public.delete_user_completely(UUID);
CREATE OR REPLACE FUNCTION public.delete_user_completely(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_user_completely(UUID) TO anon, authenticated, service_role;

-- 5. Backfill existing auth.users into public.profiles
INSERT INTO public.profiles (
  id,
  email,
  name,
  full_name,
  avatar_url,
  plan,
  credits,
  visualisations,
  downloads,
  shares,
  status,
  created_at,
  updated_at
)
SELECT 
  u.id, 
  u.email, 
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'User'),
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'User'),
  COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', ''),
  'Free',
  10,
  0,
  0,
  0,
  'active',
  u.created_at,
  NOW()
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = COALESCE(public.profiles.name, EXCLUDED.name),
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
  avatar_url = CASE 
    WHEN EXCLUDED.avatar_url IS NOT NULL AND EXCLUDED.avatar_url <> '' THEN EXCLUDED.avatar_url 
    ELSE public.profiles.avatar_url 
  END,
  updated_at = NOW();

-- 6. Reload schema cache for instant PostgREST reflection
NOTIFY pgrst, 'reload schema';
