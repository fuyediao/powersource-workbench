# PowerSource Workbench API

Go login and invitation service for the Workbench desktop client. Password exchange and Auth Admin calls stay on this process. Table reads and writes for workspace data stay on the desktop Supabase Data API with the user JWT, matching GeoCRM.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/login` | Username and password. Returns GoTrue tokens plus the Workbench profile. |
| `POST` | `/auth/refresh` | Refresh token rotation. |
| `POST` | `/auth/logout` | Revoke the local GoTrue session. |
| `GET` | `/auth/me` | Current Workbench profile. |
| `POST` | `/auth/invitations` | Super admin or system admin creates a one-time invite. |
| `GET` | `/health` | Liveness. |

The unique super administrator signs in as `contact` with the existing GeoCRM password. Go maps that username to `contact@geocrm.org` on the shared Auth host.

## Local run

```powershell
cd backend
copy .env.example .env
go test ./...
go run ./cmd/workbench-api
```

`scripts/configure-local-env.py` writes `backend/.env` from the GeoCRM keys. Default listen port is `3010`.
