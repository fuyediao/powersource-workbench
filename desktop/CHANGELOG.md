# Changelog

All notable changes to the PowerSource Workbench desktop application are documented here.

## Unreleased

- Replaced the slim Workbench shell with a full copy of the GeoCRM Electron source tree so the desktop UI can be adapted in place.
- Stored the Simplified Chinese locale as `zh-cn.json` / `zh-CN` instead of a Traditional Chinese filename.
- Clarified the sign-in subtitle so it no longer refers to an existing administrator account.
- Removed unused locale IPC and leftover invitation error strings.
- Pointed desktop login at `https://api.powersource.work` and workspace rows at `https://supabase.powersource.work`. Username is the only sign-in identity.
- Added the `super_admin` role to the signed-in profile and invitation gate.
- Removed invitation activation from the login form so signed-out users see only username and password sign-in.
- Removed the left branding panel from the login screen.
- Added the standalone PowerSource Workbench Electron shell.
- Migrated the desktop, search, and settings experiences without CRM modules.
- Added invitation activation and password-only account login.
- Added system, light, and dark appearance preferences and persisted language selection.
- Fixed login contrast in system dark mode and hid the default Electron menu bar.
- Added a secure `workbench://app` production origin so packaged builds can call the allowlisted API without a wildcard or opaque file origin.
- Removed legacy product terminology from the visible Workbench experience.
- Replaced the Go API session client with direct Supabase Auth and Edge Function calls.
- Added persisted Supabase access-token refresh while keeping the interface username-only.
- Improved localization of direct Supabase Auth and Edge Function error codes.
