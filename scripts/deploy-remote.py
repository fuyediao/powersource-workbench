"""Deploy workbench-api to the powersource.work VPS.

Packages backend/, uploads a build archive, compiles in a temporary directory
on the VPS, and recreates the workbench-api container on supabase_default.
Only /opt/workbench-backend/.env persists. Server keys are copied from the
existing /opt/supabase-project/.env on that host. Extra Ask keys are merged
in place so ENCRYPTION_KEY survives rebuilds. This script does not touch
the powersource.app GeoCRM stack.
"""

from __future__ import annotations

import os
import tarfile
import tempfile
from pathlib import Path

from vps_ssh import REPOSITORY_ROOT, connect_ssh, run_ssh

LOCAL_ROOT = REPOSITORY_ROOT / "backend"
MIGRATIONS_DIR = REPOSITORY_ROOT / "supabase" / "migrations"
REMOTE_DIR = "/opt/workbench-backend"
COMPOSE_DIR = "/opt/supabase-project"
COMPOSE_FILE = "docker-compose.workbench.yml"
IMAGE_NAME = "workbench-api:latest"
REMOTE_TAR = "/tmp/workbench-backend-deploy.tar.gz"

SKIP_DIRS = {".git", ".idea", "node_modules", "tmp"}
SKIP_FILES = {".env", ".smoke-out.log", ".smoke-err.log"}
SKIP_SUFFIXES = (".test", ".out")

COMPOSE_CONTENT = f"""services:
  workbench-api:
    image: {IMAGE_NAME}
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"
    env_file: {REMOTE_DIR}/.env
    networks:
      supabase_default:
        aliases:
          - workbench-api

networks:
  supabase_default:
    external: true
"""


def should_skip(arcname: str) -> bool:
    """Return whether a backend path should stay out of the deploy archive."""
    parts = arcname.replace("\\", "/").split("/")
    if any(part in SKIP_DIRS for part in parts):
        return True
    if parts[-1] in SKIP_FILES:
        return True
    return parts[-1].endswith(SKIP_SUFFIXES)


def make_tarball() -> str:
    """Pack the Workbench Go sources and SQL migrations into a temporary archive."""
    fd, path = tempfile.mkstemp(suffix=".tar.gz")
    os.close(fd)
    with tarfile.open(path, "w:gz") as tar:
        for item in LOCAL_ROOT.rglob("*"):
            if not item.is_file():
                continue
            rel = item.relative_to(LOCAL_ROOT).as_posix()
            if should_skip(rel):
                continue
            tar.add(item, arcname=f"workbench-backend/{rel}")
        for sql in sorted(MIGRATIONS_DIR.glob("*.sql")):
            tar.add(sql, arcname=f"workbench-backend/migrations/{sql.name}")
    return path


def main() -> int:
    """Upload, build, and start workbench-api on the .work VPS."""
    if not LOCAL_ROOT.is_dir():
        print(f"Missing {LOCAL_ROOT}")
        return 1
    if not MIGRATIONS_DIR.is_dir():
        print(f"Missing {MIGRATIONS_DIR}")
        return 1

    print(f"Packing {LOCAL_ROOT} ...")
    tarball = make_tarball()
    print(f"Archive: {tarball} ({os.path.getsize(tarball) // 1024} KB)")

    client, host, user = connect_ssh()
    print(f"Connected to {user}@{host}")
    sftp = client.open_sftp()
    print(f"Uploading to {REMOTE_TAR} ...")
    sftp.put(tarball, REMOTE_TAR)
    sftp.close()
    os.unlink(tarball)

    deploy_script = f"""set -euo pipefail
REMOTE_TAR={REMOTE_TAR!r}
REMOTE_DIR={REMOTE_DIR!r}
COMPOSE_DIR={COMPOSE_DIR!r}
COMPOSE_FILE={COMPOSE_FILE!r}
IMAGE_NAME={IMAGE_NAME!r}

mkdir -p "$REMOTE_DIR"
python3 - <<'PY'
import secrets
from pathlib import Path

src = Path("/opt/supabase-project/.env")
values = {{}}
for raw in src.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    values[key.strip()] = value.strip().strip('"').strip("'")
anon = values.get("ANON_KEY", "")
service = values.get("SERVICE_ROLE_KEY", "")
if not anon or not service:
    raise SystemExit("missing ANON_KEY or SERVICE_ROLE_KEY on the Workbench Supabase stack")

env_path = Path("{REMOTE_DIR}/.env")
existing = {{}}
if env_path.exists():
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        existing[key.strip()] = value.strip().strip('"').strip("'")

def keep(key: str, default: str = "") -> str:
    value = existing.get(key, "").strip()
    return value if value else default

encryption_key = keep("ENCRYPTION_KEY") or secrets.token_hex(32)
lines = [
    "PORT=3001",
    "SUPABASE_URL=http://kong:8000",
    f"SUPABASE_ANON_KEY={{anon}}",
    f"SUPABASE_SERVICE_ROLE_KEY={{service}}",
    "SUPABASE_PUBLIC_URL=https://supabase.powersource.work",
    f"ENCRYPTION_KEY={{encryption_key}}",
    f"OA_VERIFY_URL={{keep('OA_VERIFY_URL', 'http://61.29.250.144:86/')}}",
    f"APP_PUBLIC_ORIGIN={{keep('APP_PUBLIC_ORIGIN')}}",
    f"APP_PUBLIC_ORIGIN_ALLOWLIST={{keep('APP_PUBLIC_ORIGIN_ALLOWLIST')}}",
    f"DESKTOP_MIN_SUPPORTED_VERSION={{keep('DESKTOP_MIN_SUPPORTED_VERSION')}}",
    "",
]
env_path.write_text("\\n".join(lines))
env_path.chmod(0o600)
print("Merged server .env (Supabase keys refreshed; encryption preserved)")
PY

BUILD_DIR=$(mktemp -d /tmp/workbench-backend-build.XXXXXX)
trap 'rm -rf "$BUILD_DIR" "$REMOTE_TAR"' EXIT
tar -xzf "$REMOTE_TAR" -C "$BUILD_DIR" --strip-components=1
docker build --no-cache -t "$IMAGE_NAME" "$BUILD_DIR"

docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS public.workbench_schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());"
docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "INSERT INTO public.workbench_schema_migrations (filename) SELECT '20260903113749_direct_supabase_auth.sql' WHERE to_regclass('public.work_profiles') IS NOT NULL ON CONFLICT (filename) DO NOTHING;"
for sql in "$BUILD_DIR"/migrations/*.sql; do
  name=$(basename "$sql")
  applied=$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT 1 FROM public.workbench_schema_migrations WHERE filename = '$name'" | tr -d '[:space:]')
  if [ "$applied" = "1" ]; then
    echo "skip $name"
    continue
  fi
  echo "apply $name"
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$sql"
  docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "INSERT INTO public.workbench_schema_migrations (filename) VALUES ('$name');"
done

cat > "$COMPOSE_DIR/$COMPOSE_FILE" << 'COMPOSE_EOF'
{COMPOSE_CONTENT}COMPOSE_EOF

find "$REMOTE_DIR" -mindepth 1 ! -name '.env' -exec rm -rf {{}} +
cd "$COMPOSE_DIR"
docker compose -f "$COMPOSE_FILE" up -d --force-recreate workbench-api
curl -sf http://127.0.0.1:3001/health
echo
"""

    print(f"\n$ remote deploy")
    code, out, err = run_ssh(client, deploy_script, timeout=900)
    if out:
        print(out.rstrip())
    if err:
        print(err.rstrip())
    if code == 0:
        _code, status, _err = run_ssh(client, "docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep workbench || true")
        print(status)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
