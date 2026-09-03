# PowerSource Workbench Desktop

Electron desktop client for the PowerSource group workbench. It includes the desktop, local search, settings, invitation activation, and password-only account login experiences.

## Development

1. Copy `.env.example` to `.env`.
2. Set the public Supabase URL and publishable key.
3. Run `npm install`.
4. Run `npm run dev`.

The renderer connects directly to Supabase Auth and Edge Functions. It never receives a secret or legacy service-role key. Packaged builds load from the secure `workbench://app` origin.

## Production

The default Supabase origin is `https://supabase.powersource.work`. Override `VITE_SUPABASE_URL` for staging or local development. `VITE_SUPABASE_PUBLISHABLE_KEY` is required and is intentionally safe to embed in the client when RLS and least-privilege grants are active.
