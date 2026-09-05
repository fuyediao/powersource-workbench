# PowerSource Workbench API

Go login, invitation, Home widget proxy, and the Ask backend for the Workbench desktop client. Password exchange and Auth Admin calls stay on this process. Live weather, FX, market quotes, news, and search suggestions are fetched here and returned to Electron. Leftover customer rows stay on the desktop Supabase Data API with the user JWT. Ask transcripts, Mail, and Calendar are stored in Electron SQLite on the signed-in machine, not on this API.

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
| `*` | `/ai/*` | Ask chat, customer/KOL summary, model catalog, BYOK ping. |
| `GET`/`HEAD` | `/{macos-m\|macos-i\|windows}/{release}` | Desktop installer feed (`latest`, `beta`, or `beta0.1.0`). JSON when `Accept: application/json`. |
| `GET`/`HEAD` | `/download/{macos-m\|macos-i\|windows}/{release}` | Same feed under `/download`. |
| `GET` | `/health` | Liveness. |

Public `/mcp` and `/office` HTTP mounts are not part of this binary.

Login accepts a username only. Email is rejected. The first super administrator is the `ps0000` username created by `scripts/bootstrap-admin.py`. The password is stored only in Auth. AI keys live on `public.profiles`; login identity stays on `work_profiles.username`.

`/start/*` is public (no JWT). The desktop reaches it through the Electron main process, not from the renderer to Open-Meteo, Yahoo Finance, CoinGecko, or the FX CDN.

IMAP and SMTP run in Electron on this PC. Calendar events live in the desktop SQLite file. Ask conversation lists live in the desktop SQLite file. Company Postgres does not store mail bodies, attachments, or calendar events.

## Deploy

```powershell
cd ..
python scripts/deploy-remote.py
```

The deploy script merges extra env keys into `/opt/workbench-backend/.env` without wiping `ENCRYPTION_KEY` or `DESKTOP_MIN_SUPPORTED_VERSION`, applies every file in `supabase/migrations/`, and recreates the container. `scripts/configure-local-env.py` writes local ignored files from the Workbench VPS Supabase keys. The process listen port on the VPS is `3001`.

Desktop auto-update uses the same GeoCRM feed shape. Packaged Electron checks `https://download.powersource.work/{platform}/latest` (then `beta`, then the running release id). Upload a built installer with:

```powershell
python scripts/upload-desktop-release-vps.py desktop/release/0.1.0-beta/PowerSource-Workbench-0.1.0-beta-arm64.dmg macos-m beta0.1.0
```

Point nginx at the feed with `python scripts/setup-download-nginx-vps.py` after `download.powersource.work` resolves to this VPS.
