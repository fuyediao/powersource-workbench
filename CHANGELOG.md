# Changelog

All notable changes to PowerSource Workbench are documented here.

## Unreleased

- Centered the login mark and title, and removed the sign-in subtitle.
- Replaced the login mark with the POWERSOURCE OA / ERP brand SVG.
- Removed unused `supabase/.env` and `supabase/.env.example`. Desktop and Go already keep their own environment files.
- Removed Messages, Board, Map, Admin, Orders, Products, NEXDOT, T&E Admin, Team, and Clash from the desktop Home grid and Go menu.
- Removed desktop Function access and write-grant permission editors. Remaining apps are open to every signed-in user.
- Replaced GeoCRM email, Google, and OTP login with Workbench username and password sign-in through `workbench-api`, while keeping Supabase sessions for the copied desktop shell.
- Updated desktop env to two lines: `VITE_DEPLOYMENT_DOMAIN=powersource.work` and `VITE_SUPABASE_PUBLISHABLE_KEY`, deriving API and Supabase URLs in code.
- Replaced the slim Workbench Electron shell with a full copy of the GeoCRM Electron source tree, including bundled libraries and the example environment file.
- Set the first super-admin username to `ps0000`. The password is stored in Auth only, not in local `.env` files.
- Removed leftover local binaries, empty backend folders, unused Electron locale IPC, unused i18n keys, and the unused invitation Edge Functions.
- Added the root `npm run dev:electron` script so the desktop starts from the repository root.
- Pointed login and workspace data at the Workbench `powersource.work` VPS. GeoCRM on `powersource.app` remains a behavior reference only.
- Routed Workbench login through the VPS Go API. Sign-in is username and password only; Workbench tables do not store email.
- Routed Workbench login, refresh, logout, session restore, and invitation creation through a new Go API (`backend/`). The desktop still reads workspace tables directly from the Supabase Data API with the user JWT.
- Added the `super_admin` Workbench profile role, a single-row unique constraint, and a migration seed for that Auth user.
- Removed invitation activation from the desktop login form so the signed-out screen is password-only.
- Removed the left branding panel from the desktop login screen.
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
- Added Edge Function compatibility for both current Supabase keys and the legacy anonymous and service-role keys used by the existing self-hosted deployment.
- Added direct-auth helper tests and excluded generated Python bytecode from source control.
