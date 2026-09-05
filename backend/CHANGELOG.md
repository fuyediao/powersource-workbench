# Changelog

All notable changes to the PowerSource Workbench API are documented here.

## Unreleased

- Added the GeoCRM-style desktop installer feed (`/{platform}/{release}` and `/download/{platform}/{release}`) so packaged Workbench can check and download updates from `download.powersource.work`.
- Login checks stored super-admin and system-admin accounts first. Other employee ids are verified against POWERSOURCE OA (`OA_VERIFY_URL`, default `http://61.29.250.144:86/`) and receive a Workbench HMAC session. OA employees are not written to Auth or `work_profiles`.
- Removed the Harness API (`/ai/harness`) and desktop_agent module key.
- Unmounted `/mail/*`. IMAP/SMTP, drafts, and send run on the signed-in Workbench desktop. `send_mail` and `save_mail_draft` on the VPS refuse and tell the agent to use Electron.
- Dropped Mail and Calendar from first-party `list_entities`. Those datasets are not on company Postgres.
- Stopped reading Ask/Harness transcripts from Supabase. `search_harness_sessions` on the VPS returns an empty list; the desktop intercepts that tool against local SQLite.
- Removed POST `/ai/mapchat` and Ask map-pin parsing. Ask chat returns assistant text only. Gemini Google Search still runs when the client sends `webSearch`.
- Removed Gmail OAuth and Google Calendar from workbench-api. Mail and Calendar later moved fully onto the desktop.
- Copied Ask, Harness, Mail, and Calendar HTTP from GeoCRM onto workbench-api (`/ai/*`, `/ai/harness/*`, `/mail/*`, `/calendar/*`) with a Workbench ACL adapter for active `work_profiles`.
- Added curated SQL for profiles, history, groups, leftover customers, Mail, and Calendar. Deploy applies those migrations and merges encryption and Hermes volume settings without wiping existing secrets.
- Pruned in-process Harness CRM tools to tables that exist on `supabase.powersource.work`. Public `/mcp` stays unmounted.
- Proxied Home weather, FX, stock and crypto quotes, news, and search suggestions on `/start/*` so the desktop no longer calls those third-party APIs from the renderer.
- Login accepts a username only. Go loads `work_profiles` first and uses the linked Auth user for the password grant. Workbench tables do not store email.
- Deployed `workbench-api` to the PowerSource `.work` VPS behind `https://api.powersource.work`.
- Added the Workbench Go API for login, token refresh, logout, session restore, and invitation creation. Desktop clients keep using the user JWT against the Supabase Data API for workspace rows on `https://supabase.powersource.work`.
