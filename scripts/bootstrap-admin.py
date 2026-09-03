"""Create the first Workbench super-admin username on the .work Auth host."""

from __future__ import annotations

import json
import secrets
from pathlib import Path

from vps_ssh import connect_ssh, read_env

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SUPABASE_ENV = REPOSITORY_ROOT / "supabase" / ".env"


def persist_admin_password(password: str) -> None:
    """Write the generated administrator password into the ignored env file."""
    lines: list[str] = []
    replaced = False
    for raw in SUPABASE_ENV.read_text(encoding="utf-8").splitlines():
        if raw.startswith("WORKBENCH_ADMIN_PASSWORD="):
            lines.append(f"WORKBENCH_ADMIN_PASSWORD={password}")
            replaced = True
        else:
            lines.append(raw)
    if not replaced:
        lines.append(f"WORKBENCH_ADMIN_PASSWORD={password}")
    SUPABASE_ENV.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    SUPABASE_ENV.chmod(0o600)


def bootstrap() -> None:
    """Create or refresh the Workbench super-admin username on .work Auth."""
    if not SUPABASE_ENV.exists():
        raise RuntimeError("Run scripts/configure-local-env.py before bootstrapping the administrator")
    settings = read_env(SUPABASE_ENV)
    username = settings.get("WORKBENCH_ADMIN_USERNAME", "").strip().lower() or "admin"
    display_name = settings.get("WORKBENCH_ADMIN_DISPLAY_NAME", "Super Administrator").strip() or "Super Administrator"
    password = settings.get("WORKBENCH_ADMIN_PASSWORD", "").strip()
    if len(username) < 3:
        raise RuntimeError("WORKBENCH_ADMIN_USERNAME is not a valid Workbench username")
    if not password:
        password = secrets.token_urlsafe(24)
        persist_admin_password(password)

    payload = json.dumps({
        "display_name": display_name,
        "password": password,
        "username": username,
    })
    remote_payload = "/tmp/workbench-bootstrap.json"
    client, _host, _user = connect_ssh()
    try:
        sftp = client.open_sftp()
        with sftp.file(remote_payload, "w") as handle:
            handle.write(payload)
        sftp.chmod(remote_payload, 0o600)
        sftp.close()
        command = (
            "python3 - '" + remote_payload + "' <<'PY'\n"
            + remote_bootstrap_source()
            + "\nPY\n"
            + "rm -f '" + remote_payload + "'\n"
        )
        _stdin, stdout, stderr = client.exec_command(command, timeout=60)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()
    finally:
        client.close()

    if code != 0:
        raise RuntimeError(err.strip() or out.strip() or "remote bootstrap failed")
    print(out.strip() or "Bootstrapped the Workbench super-admin username. The password is in supabase/.env.")


def remote_bootstrap_source() -> str:
    """Return the Python source that runs against the VPS Auth listener."""
    return r'''
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

def read_env(path):
    values = {}
    for raw in Path(path).read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values

def request_json(url, key, method, payload=None, prefer=""):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read()
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        raise SystemExit("Supabase request failed with HTTP %s: %s" % (error.code, message))

body = json.loads(Path(sys.argv[1]).read_text())
username = body["username"]
password = body["password"]
display_name = body["display_name"]
settings = read_env("/opt/supabase-project/.env")
key = settings.get("SERVICE_ROLE_KEY", "")
if not key:
    raise SystemExit("missing SERVICE_ROLE_KEY")
base = "http://127.0.0.1:8000"

user = None
for page in range(1, 11):
    listed = request_json(
        base + "/auth/v1/admin/users?" + urllib.parse.urlencode({"page": page, "per_page": 200}),
        key,
        "GET",
    )
    users = listed.get("users") if isinstance(listed, dict) else None
    if not isinstance(users, list) or not users:
        break
    for item in users:
        metadata = item.get("app_metadata") if isinstance(item, dict) else None
        if isinstance(metadata, dict) and str(metadata.get("username", "")).lower() == username:
            user = item
            break
    if user is not None:
        break

metadata = {"display_name": display_name, "role": "super_admin", "username": username}
if user is None:
    user = request_json(
        base + "/auth/v1/admin/users",
        key,
        "POST",
        {
            "app_metadata": metadata,
            "email": username + "@users.invalid",
            "email_confirm": True,
            "password": password,
        },
    )
else:
    request_json(
        base + "/auth/v1/admin/users/" + str(user["id"]),
        key,
        "PUT",
        {"app_metadata": metadata, "email_confirm": True, "password": password},
    )

user_id = user.get("id")
if not user_id:
    raise SystemExit("Supabase did not return the administrator identifier")
payload = {
    "display_name": display_name,
    "id": user_id,
    "role": "super_admin",
    "status": "active",
    "username": username,
}
existing = request_json(
    base + "/rest/v1/work_profiles?" + urllib.parse.urlencode({"id": "eq." + user_id, "select": "id"}),
    key,
    "GET",
)
if isinstance(existing, list) and existing:
    request_json(base + "/rest/v1/work_profiles?id=eq." + user_id, key, "PATCH", payload, "return=minimal")
else:
    request_json(base + "/rest/v1/work_profiles", key, "POST", payload, "return=minimal")
print("Bootstrapped the Workbench super-admin username. The password is in supabase/.env.")
'''


if __name__ == "__main__":
    bootstrap()
