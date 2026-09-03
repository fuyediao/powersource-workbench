# Changelog

All notable changes to the PowerSource Workbench desktop application are documented here.

## Unreleased

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
