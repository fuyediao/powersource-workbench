# PowerSource Workbench Supabase

This directory contains Workbench SQL on the `powersource.work` stack. Login and invitation creation run in `backend/` (Go). There are no Edge Functions. The desktop reads workspace tables through the Supabase Data API with the user JWT. Ask, Mail, and Calendar sync go through `workbench-api`.

GeoCRM on `powersource.app` is a behavior reference only. Do not apply these migrations to that database. Do not copy GeoCRM production data.

## Migrations

| File | Purpose |
| --- | --- |
| `20260903113749_direct_supabase_auth.sql` | `work_profiles` and invitations. |
| `20260904120000_ask_ai_profiles_history.sql` | `profiles` (BYOK keys), Ask `history`, map pins, avatar bucket. |
| `20260904120100_groups_customers_mail_calendar.sql` | Groups, leftover customers/contacts, Mail, Calendar, write-grant tables. |
| `20260904140000_drop_gmail_google_calendar.sql` | Drop unused Gmail OAuth and Google Calendar sync tables. |
| `20260904150000_profile_display_name_not_username.sql` | Stop copying the login username into `profiles.display_name`. |
| `20260905030000_drop_history_and_map_pins.sql` | Drop `history` and `agent_location_sets` (transcripts are local SQLite). |
| `20260905145000_drop_desktop_agent.sql` | Drop the `desktop_agent` module key from group desktop access. |
| `20260906020000_desktop_releases_bucket.sql` | Public `desktop-releases` Storage bucket for installer feeds. |

`scripts/deploy-remote.py` applies these files in name order and records them in `public.workbench_schema_migrations`.

## Required runtime settings

This folder holds SQL migrations only. Desktop uses `desktop/.env`. The Go API uses `backend/.env`. Neither file belongs here.
