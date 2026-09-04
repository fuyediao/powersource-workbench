# PowerSource Workbench API

Go login, invitation, Home widget proxy, and the Ask / Harness / Mail / Calendar backends for the Workbench desktop client. Password exchange and Auth Admin calls stay on this process. Live weather, FX, market quotes, news, and search suggestions are fetched here and returned to Electron. Native calendar events, Ask history, and leftover customer rows stay on the desktop Supabase Data API with the user JWT.

The production host is `https://api.powersource.work` on the Workbench VPS. It talks to `https://supabase.powersource.work` (internally `http://kong:8000`). Do not point this service at the GeoCRM `powersource.app` stack.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/login` | Username and password. Returns GoTrue tokens plus the Workbench profile. |
| `POST` | `/auth/refresh` | Refresh token rotation. |
| `POST` | `/auth/logout` | Revoke the local GoTrue session. |
| `GET` | `/auth/me` | Current Workbench profile. |
| `POST` | `/auth/invitations` | Super admin or system admin creates a one-time invite. |
| `GET` | `/start/suggest` | Search-box autocomplete (`engine`, `q`). |
| `POST` | `/start/markets/quotes` | Live stock and crypto quotes for selected assets. |
| `GET` | `/start/markets/search` | Stock and crypto picker search (`q`). |
| `GET` | `/start/news` | Latest editorial briefing item. |
| `GET` | `/start/weather` | Current conditions (`lat`, `lon`). |
| `GET` | `/start/weather/place` | Reverse geocode (`lat`, `lon`, `language`). |
| `GET` | `/start/weather/search` | City search (`q`, `language`). |
| `GET` | `/start/currency/catalog` | Fiat and crypto FX catalog. |
| `GET` | `/start/currency/convert` | FX conversion (`amount`, `from`, `to`). |
| `*` | `/ai/*` | Ask chat, mapchat, customer/KOL summary, model catalog, BYOK ping. |
| `*` | `/ai/harness/*` | Harness memory, review, cron, wake, skills, experts, tools. |
| `*` | `/mail/*` | IMAP/Gmail accounts, sync, send, and mail-by-customer. |
| `GET` | `/mail/oauth/google/callback` | Gmail OAuth return (public). |
| `*` | `/calendar/google/*` | Google Calendar OAuth, sync, and calendar list. |
| `GET` | `/calendar/oauth/google/callback` | Google Calendar OAuth return (public). |
| `POST` | `/calendar/webhooks/google` | Google Calendar push notifications (public). |
| `GET` | `/health` | Liveness. |

Public `/mcp` and `/office` HTTP mounts are not part of this binary. Harness first-party CRM tools call `mcp.CallForUser` in-process.

Login accepts a username only. Email is rejected. The first super administrator is the `ps0000` username created by `scripts/bootstrap-admin.py`. The password is stored only in Auth. AI keys live on `public.profiles`; login identity stays on `work_profiles.username`.

`/start/*` is public (no JWT). The desktop reaches it through the Electron main process, not from the renderer to Open-Meteo, Yahoo Finance, CoinGecko, or the FX CDN.

## Google OAuth

Register these redirects on the Google Cloud OAuth client used by Workbench (reuse the `.app` client or create a `.work` client):

- `https://api.powersource.work/mail/oauth/google/callback`
- `https://api.powersource.work/calendar/oauth/google/callback`

Push notifications use `https://api.powersource.work/calendar/webhooks/google`. IMAP and SMTP for non-Gmail accounts run inside the workbench-api container, not in Electron.

## Harness volume

Each signed-in user gets `<HERMES_PROFILES_ROOT>/<user_id>/` for MEMORY.md, USER.md, unpublished skills, and `jobs.json`. Deploy mounts `/opt/workbench-hermes/profiles` into the container. Org skills ship in the image at `/app/assets/harness/org-skills`.

## Deploy

```powershell
cd ..
python scripts/deploy-remote.py
```

The deploy script merges extra env keys into `/opt/workbench-backend/.env` without wiping Google OAuth secrets or `ENCRYPTION_KEY`, applies every file in `supabase/migrations/`, and recreates the container. `scripts/configure-local-env.py` writes local ignored files from the Workbench VPS Supabase keys. The process listen port on the VPS is `3001`.
