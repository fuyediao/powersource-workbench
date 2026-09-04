# Changelog

All notable changes to the PowerSource Workbench API are documented here.

## Unreleased

- Removed Gmail OAuth and Google Calendar from workbench-api. Mail keeps IMAP/SMTP. Native calendar events stay on the desktop Supabase Data API.
- Copied Ask, Harness, Mail, and Calendar HTTP from GeoCRM onto workbench-api (`/ai/*`, `/ai/harness/*`, `/mail/*`, `/calendar/*`) with a Workbench ACL adapter for active `work_profiles`.
- Added curated SQL for profiles, history, groups, leftover customers, Mail, and Calendar. Deploy applies those migrations and merges encryption and Hermes volume settings without wiping existing secrets.
- Pruned in-process Harness CRM tools to tables that exist on `supabase.powersource.work`. Public `/mcp` stays unmounted.
- Proxied Home weather, FX, stock and crypto quotes, news, and search suggestions on `/start/*` so the desktop no longer calls those third-party APIs from the renderer.
- Login accepts a username only. Go loads `work_profiles` first and uses the linked Auth user for the password grant. Workbench tables do not store email.
- Deployed `workbench-api` to the PowerSource `.work` VPS behind `https://api.powersource.work`.
- Added the Workbench Go API for login, token refresh, logout, session restore, and invitation creation. Desktop clients keep using the user JWT against the Supabase Data API for workspace rows on `https://supabase.powersource.work`.
