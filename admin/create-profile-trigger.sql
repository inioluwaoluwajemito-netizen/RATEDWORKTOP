-- =========================================================================
-- RatedWorktops — Automatic Profile Trigger (Supabase SQL)
-- =========================================================================
-- This script configures a Postgres trigger inside your Supabase database 
-- to automatically create a row in the `public.profiles` table whenever a
-- new user registers via Email or Google OAuth (creating a row in `auth.users`).
--
-- Note: We have already implemented a bulletproof client-side fallback in 
-- js/visualiser.js, but running this database trigger is recommended as the 
-- industry best-practice for data integrity.
--
-- Instructions:
-- 1. Copy this entire script.
-- 2. Go to your Supabase Dashboard -> SQL Editor.
-- 3. Paste and click "Run".
-- =========================================================================

-- 1. Create the trigger function
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, plan, credits)
  values (
    new.id,
    -- Attempt to fetch the user's name from OAuth metadata, falling back to a default
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      'New User'
    ),
    new.email,
    'Free',
    10 -- Give 10 starter credits automatically
  )
  -- Bypasses duplicate keys if client-side registers insert first
  on conflict (id) do nothing;
  
  return new;
end;
$$ language plpgsql security definer;

-- 2. Create the trigger on the auth.users table
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================================
-- Verification Query
-- =========================================================================
-- Check if the trigger is active:
--   select trigger_name, event_manipulation, relation_jsp, action_statement
--   from information_schema.triggers
--   where trigger_name = 'on_auth_user_created';
