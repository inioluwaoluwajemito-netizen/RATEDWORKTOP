-- =========================================================================
-- RatedWorktops — Delete User Completely (Admin Function)
-- =========================================================================
-- This creates a PostgreSQL function that permanently deletes a user from
-- BOTH the public.profiles table AND the auth.users table in Supabase.
--
-- Without this function, deleting a user's profile row still leaves their
-- auth record intact — meaning they can sign back in via Google OAuth
-- and a new profile gets auto-created.
--
-- Instructions:
-- 1. Go to your Supabase Dashboard -> SQL Editor
-- 2. Paste this entire script and click "Run"
-- 3. The admin portal will automatically use this function
-- =========================================================================

-- Create the function with security definer so it runs with elevated privileges
-- (needed to access auth.users which is not accessible via the anon key)
create or replace function public.delete_user_completely(user_id uuid)
returns void as $$
begin
  -- 1. Delete the user's profile from the public.profiles table
  delete from public.profiles where id = user_id;

  -- 2. Delete the user from Supabase Auth (auth.users)
  -- This permanently removes their authentication record so they
  -- cannot sign back in with the same OAuth or email credentials.
  delete from auth.users where id = user_id;
end;
$$ language plpgsql security definer;

-- Grant execute permission to the anon and authenticated roles
-- so the admin portal (which uses the anon key) can call this function
grant execute on function public.delete_user_completely(uuid) to anon;
grant execute on function public.delete_user_completely(uuid) to authenticated;
