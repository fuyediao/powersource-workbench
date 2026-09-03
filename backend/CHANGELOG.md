# Changelog

All notable changes to the PowerSource Workbench API are documented here.

## Unreleased

- Proxied Home weather, FX, stock and crypto quotes, news, and search suggestions on `/start/*` so the desktop no longer calls those third-party APIs from the renderer.
- Login accepts a username only. Go loads `work_profiles` first and uses the linked Auth user for the password grant. Workbench tables do not store email.
- Deployed `workbench-api` to the PowerSource `.work` VPS behind `https://api.powersource.work`.
- Added the Workbench Go API for login, token refresh, logout, session restore, and invitation creation. Desktop clients keep using the user JWT against the Supabase Data API for workspace rows on `https://supabase.powersource.work`.
