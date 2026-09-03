# PowerSource Workbench Desktop

Electron desktop client for the PowerSource group workbench. It includes the desktop, local search, settings, and password-only account login experiences.

## Development

1. Run `python ../scripts/configure-local-env.py` so `.env` points at `powersource.work`.
2. Run `npm install` in this directory.
3. From the repository root, run `npm run dev:electron`. `npm run dev` in this directory still works.

The renderer posts login to `https://api.powersource.work` and reads workspace rows from `https://supabase.powersource.work`. It never receives a secret or legacy service-role key. Packaged builds load from the secure `workbench://app` origin.

Window, tray, and installer icons use the POWERSOURCE mark in `public/app-icon.svg`. After editing that file, run `npm run icons:rasterize` and `npm run icons:nsis`.

## Production

The default API origin is `https://api.powersource.work`. The default Supabase origin is `https://supabase.powersource.work`. `VITE_SUPABASE_PUBLISHABLE_KEY` is required and is intentionally safe to embed in the client when RLS and least-privilege grants are active.
