-- Drop unused Gmail OAuth state and Google Calendar sync tables.
-- Native calendars and IMAP mailboxes stay. English comments only. Idempotent.

DROP TABLE IF EXISTS public.calendar_google_watch_channels CASCADE;
DROP TABLE IF EXISTS public.calendar_google_account_secrets CASCADE;
DROP TABLE IF EXISTS public.calendar_google_oauth_states CASCADE;
DROP TABLE IF EXISTS public.calendar_google_accounts CASCADE;
DROP TABLE IF EXISTS public.mail_oauth_states CASCADE;
