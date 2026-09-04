-- Drop Mail and Calendar from company Postgres and Storage.
-- Bodies, attachments, and events now live in Electron SQLite on this PC.
-- English comments only. Idempotent.

DO $$
BEGIN
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE bucket_id = 'mail-attachments';
  IF to_regclass('storage.prefixes') IS NOT NULL THEN
    EXECUTE $q$DELETE FROM storage.prefixes WHERE bucket_id = 'mail-attachments'$q$;
  END IF;
  DELETE FROM storage.buckets WHERE id = 'mail-attachments';
END $$;

DROP TABLE IF EXISTS public.mail_message_snoozes CASCADE;
DROP TABLE IF EXISTS public.mail_sync_tasks CASCADE;
DROP TABLE IF EXISTS public.mail_sync_jobs CASCADE;
DROP TABLE IF EXISTS public.mail_send_jobs CASCADE;
DROP TABLE IF EXISTS public.mail_attachments CASCADE;
DROP TABLE IF EXISTS public.mail_message_bodies CASCADE;
DROP TABLE IF EXISTS public.mail_messages CASCADE;
DROP TABLE IF EXISTS public.mail_threads CASCADE;
DROP TABLE IF EXISTS public.mail_folders CASCADE;
DROP TABLE IF EXISTS public.mail_account_secrets CASCADE;
DROP TABLE IF EXISTS public.mail_oauth_states CASCADE;
DROP TABLE IF EXISTS public.mail_accounts CASCADE;

DROP TABLE IF EXISTS public.calendar_event_attendees CASCADE;
DROP TABLE IF EXISTS public.calendar_events CASCADE;
DROP TABLE IF EXISTS public.calendars CASCADE;
DROP TABLE IF EXISTS public.calendar_google_watch_channels CASCADE;
DROP TABLE IF EXISTS public.calendar_google_account_secrets CASCADE;
DROP TABLE IF EXISTS public.calendar_google_oauth_states CASCADE;
DROP TABLE IF EXISTS public.calendar_google_accounts CASCADE;

DROP FUNCTION IF EXISTS public.mail_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.can_access_mail_account(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.calendar_user_is_event_attendee(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.calendar_user_can_read_event_row(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.calendar_user_can_manage_event_attendees(uuid, uuid) CASCADE;

NOTIFY pgrst, 'reload schema';
