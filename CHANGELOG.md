# Changelog

All notable changes to PowerSource Workbench are documented here.

## Unreleased

- Created the PowerSource Workbench desktop foundation.
- Migrated only the desktop, settings, and local search product areas from the GeoCRM design baseline.
- Removed CRM-specific navigation, data models, modules, and the previous permission editor from the new product boundary.
- Added invitation-only username and password authentication backed by Supabase Postgres.
- Added a system administrator bootstrap and one-time invitation creation flow.
- Added direct Supabase deployment configuration for the PowerSource `.work` environment.
- Verified the Electron login and invitation screens with Windows Computer Use and corrected dark-mode contrast.
- Added a secure custom protocol for packaged renderer files and completed legacy terminology cleanup in the new application.
- Added a safe local environment configurator that transfers the existing Supabase service key, derives the `.work` endpoints, and generates the initial administrator password without logging secrets.
- Added support for the current Supabase server secret key while retaining compatibility with legacy service-role deployments.
- Replaced the interim Go API with direct Supabase Auth, RLS-protected profiles, and invitation Edge Functions.
- Moved client configuration to a public Supabase URL and publishable key while keeping privileged keys only in ignored deployment files.
