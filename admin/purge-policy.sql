-- =========================================================================
-- RatedWorktops — Unsaved Storage Purge Policy
-- =========================================================================
-- This script schedules a database cron job inside your Supabase instance 
-- to automatically clean up unsaved kitchen templates and temporary renders
-- older than 48 hours. This prevents storage cost bloat.
--
-- Instructions:
-- 1. Copy this entire script.
-- 2. Go to your Supabase Dashboard -> SQL Editor.
-- 3. Paste and click "Run".
-- =========================================================================

-- 1. Enable pg_cron extension (Supabase natively supports pg_cron on the "extensions" schema)
create extension if not exists pg_cron with schema extensions;

-- 2. Create the SQL function to execute the cleanup
create or replace function public.purge_unsaved_temp_files()
returns void as $$
begin
  -- Supabase deletes the underlying physical cloud files automatically 
  -- via database triggers when rows are deleted from storage.objects.
  delete from storage.objects
  where bucket_id = 'ratedworktops'
    -- Only purge files older than 48 hours
    and created_at < (now() - interval '48 hours')
    -- Target both original uploaded templates and output renders
    and (
      name like 'originals/%' 
      or name like 'outputs/%'
    )
    -- Crucial: Ensure we do NOT delete files associated with saved projects!
    and id not in (
      -- Extract the storage object ID or check if the public URL exists in projects
      -- Since projects.image_url stores the public URL, we match by checking if the URL contains the object name.
      -- e.g. "https://.../ratedworktops/outputs/user-id/uuid.jpg" contains "outputs/user-id/uuid.jpg"
      select id from storage.objects
      where exists (
        select 1 from public.projects p
        where p.image_url like '%' || storage.objects.name
      )
    );
    
  raise notice 'Purge complete: Unsaved temporary storage objects older than 48 hours removed.';
end;
$$ language plpgsql security definer;

-- 3. Schedule the cron job to run every hour at minute 0
-- This executes on the standard postgres database connection
select cron.schedule(
  'purge-unsaved-storage-hourly', -- Unique Cron Job Name
  '0 * * * *',                    -- Cron schedule: Run at minute 0 of every hour
  'select public.purge_unsaved_temp_files();'
);

-- =========================================================================
-- Verification Queries (You can run these in SQL Editor to test manually)
-- =========================================================================
--
-- Check active cron schedules:
--   select * from cron.job;
--
-- View logs of executed cron jobs:
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- Execute purge immediately:
--   select public.purge_unsaved_temp_files();
--
-- Count files currently eligible for deletion (older than 48h and unsaved):
--   select count(*) from storage.objects
--   where bucket_id = 'ratedworktops'
--     and created_at < (now() - interval '48 hours')
--     and (name like 'originals/%' or name like 'outputs/%')
--     and id not in (
--       select id from storage.objects
--       where exists (
--         select 1 from public.projects p
--         where p.image_url like '%' || storage.objects.name
--       )
--     );
