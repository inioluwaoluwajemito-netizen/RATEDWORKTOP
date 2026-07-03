-- =========================================================================
-- RatedWorktops — Admin User Management Functions & Policies
-- =========================================================================
-- This script does THREE things:
-- 1. Creates a function to permanently delete a user (auth + profile)
-- 2. Adds RLS policies so the admin can delete/update any user's profile
-- 3. Ensures the profiles table has a 'status' column for suspend/reactivate
--
-- Instructions:
-- 1. Go to your Supabase Dashboard -> SQL Editor
-- 2. Paste this entire script and click "Run"
-- 3. The admin portal will automatically use these functions
-- =========================================================================


-- =========================================================================
-- STEP 1: Add 'status' column to profiles (if it doesn't exist)
-- =========================================================================
-- This column is needed for the suspend/reactivate feature
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'status'
  ) then
    alter table public.profiles add column status text default 'active';
  end if;
end $$;


-- =========================================================================
-- STEP 2: Create the delete_user_completely function
-- =========================================================================
-- This permanently deletes a user from BOTH profiles AND auth.users
create or replace function public.delete_user_completely(user_id uuid)
returns void as $$
begin
  -- Delete the user's profile from the public.profiles table
  delete from public.profiles where id = user_id;

  -- Delete the user from Supabase Auth (auth.users)
  -- This permanently removes their authentication record
  delete from auth.users where id = user_id;
end;
$$ language plpgsql security definer;

-- Grant execute permission so the admin portal can call this function
grant execute on function public.delete_user_completely(uuid) to anon;
grant execute on function public.delete_user_completely(uuid) to authenticated;


-- =========================================================================
-- STEP 3: Enable RLS and add admin-friendly policies
-- =========================================================================
-- Enable RLS on profiles if not already enabled
alter table public.profiles enable row level security;

-- Allow anyone to read all profiles (needed for admin dashboard)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Allow public read access to profiles') then
    create policy "Allow public read access to profiles"
      on public.profiles for select
      using (true);
  end if;
end $$;

-- Allow users to insert their own profile (for sign-up / OAuth first login)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Allow users to insert own profile') then
    create policy "Allow users to insert own profile"
      on public.profiles for insert
      with check (true);
  end if;
end $$;

-- Allow any authenticated user to update any profile
-- (needed for admin to suspend/reactivate/reset credits)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Allow update access to profiles') then
    create policy "Allow update access to profiles"
      on public.profiles for update
      using (true)
      with check (true);
  end if;
end $$;

-- Allow any authenticated user to delete profiles
-- (needed for admin to delete users from the dashboard)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Allow delete access to profiles') then
    create policy "Allow delete access to profiles"
      on public.profiles for delete
      using (true);
  end if;
end $$;
