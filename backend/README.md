# PowerSource Workbench API

Go login, invitation, and Home widget proxy for the Workbench desktop client. Password exchange and Auth Admin calls stay on this process. Live weather, FX, market quotes, news, and search suggestions are fetched here and returned to Electron. Table reads and writes for workspace data stay on the desktop Supabase Data API with the user JWT, matching the GeoCRM split.

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
| `GET` | `/health` | Liveness. |

Login accepts a username only. Email is rejected. The first super administrator is the `ps0000` username created by `scripts/bootstrap-admin.py`. The password is stored only in Auth.

`/start/*` is public (no JWT). The desktop reaches it through the Electron main process, not from the renderer to Open-Meteo, Yahoo Finance, CoinGecko, or the FX CDN.

## Deploy

```powershell
cd ..
python scripts/deploy-remote.py
```

`scripts/configure-local-env.py` writes local ignored files from the Workbench VPS Supabase keys. The process listen port on the VPS is `3001`.
