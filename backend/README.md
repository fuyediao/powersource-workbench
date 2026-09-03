# PowerSource Workbench API

Go login and invitation service for the Workbench desktop client. Password exchange and Auth Admin calls stay on this process. Table reads and writes for workspace data stay on the desktop Supabase Data API with the user JWT, matching the GeoCRM split.

The production host is `https://api.powersource.work` on the Workbench VPS. It talks to `https://supabase.powersource.work` (internally `http://kong:8000`). Do not point this service at the GeoCRM `powersource.app` stack.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/login` | Username and password. Returns GoTrue tokens plus the Workbench profile. |
| `POST` | `/auth/refresh` | Refresh token rotation. |
| `POST` | `/auth/logout` | Revoke the local GoTrue session. |
| `GET` | `/auth/me` | Current Workbench profile. |
| `POST` | `/auth/invitations` | Super admin or system admin creates a one-time invite. |
| `GET` | `/health` | Liveness. |

Login accepts a username only. Email is rejected. The first super administrator is the `admin` username created by `scripts/bootstrap-admin.py`.

## Deploy

```powershell
cd ..
python scripts/deploy-remote.py
```

`scripts/configure-local-env.py` writes local ignored files from the Workbench VPS Supabase keys. The process listen port on the VPS is `3001`.
