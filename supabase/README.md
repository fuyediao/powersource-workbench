# PowerSource Workbench Supabase

This directory contains the direct Supabase backend for Workbench authentication.

## Components

- The migration replaces the removed custom Go sessions with Supabase Auth-backed profiles and one-time invitations.
- `create-work-invitation` requires an authenticated system administrator.
- `activate-work-invitation` accepts a publishable API key but creates an account only after validating a high-entropy, single-use invitation.
- RLS allows authenticated users to read only their own profile. Invitation tables have no direct client grants.

## Required runtime settings

The Edge runtime must provide its normal Supabase URL, publishable keys, secret keys, and JWKS configuration. Set `WORKBENCH_ACCOUNT_EMAIL_DOMAIN` to `accounts.powersource.work` when deploying the functions.

Use the root `scripts/bootstrap-admin.py` only after applying the migration. Its secret key remains in the ignored `supabase/.env` file and is never bundled into Electron.
