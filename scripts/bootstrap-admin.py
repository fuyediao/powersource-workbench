"""Create or rename the Workbench super-admin username on the .work Auth host.

Passwords are written only to Auth. They are not stored in local .env files.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from vps_ssh import connect_ssh

DEFAULT_USERNAME = "ps0000"
DEFAULT_DISPLAY_NAME = "Super Administrator"


def parse_arguments() -> argparse.Namespace:
    """Parse the one-time administrator bootstrap options."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", default=DEFAULT_USERNAME, help="Workbench username")
    parser.add_argument("--password", required=True, help="Auth password; stored only in the database")
    parser.add_argument("--display-name", default=DEFAULT_DISPLAY_NAME, help="Profile display name")
    return parser.parse_args()


def bootstrap(username: str, password: str, display_name: str) -> None:
    """Create or refresh the Workbench super-admin username on .work Auth."""
    username = username.strip().lower()
    if len(username) < 3:
        raise RuntimeError("The Workbench username is invalid")
    if not password:
        raise RuntimeError("A database password is required")

    payload = json.dumps({
        "display_name": display_name.strip() or DEFAULT_DISPLAY_NAME,
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
    print(out.strip() or "Bootstrapped the Workbench super-admin username in Auth.")


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

def find_user(match_username):
    for page in range(1, 11):
        listed = request_json(
            base + "/auth/v1/admin/users?" + urllib.parse.urlencode({"page": page, "per_page": 200}),
            key,
            "GET",
        )
        users = listed.get("users") if isinstance(listed, dict) else None
        if not isinstance(users, list) or not users:
            return None
        for item in users:
            metadata = item.get("app_metadata") if isinstance(item, dict) else None
            if isinstance(metadata, dict) and str(metadata.get("username", "")).lower() == match_username:
                return item
    return None

user = find_user(username)
if user is None:
    existing_profile = request_json(
        base + "/rest/v1/work_profiles?" + urllib.parse.urlencode({"role": "eq.super_admin", "select": "id,username"}),
        key,
        "GET",
    )
    if isinstance(existing_profile, list) and existing_profile:
        user = request_json(base + "/auth/v1/admin/users/" + str(existing_profile[0]["id"]), key, "GET")

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
print("Bootstrapped the Workbench super-admin username in Auth.")
'''


if __name__ == "__main__":
    arguments = parse_arguments()
    bootstrap(arguments.username, arguments.password, arguments.display_name)
