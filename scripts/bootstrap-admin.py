"""Attach the existing GeoCRM super-admin Auth user to Workbench."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SUPABASE_ENV = REPOSITORY_ROOT / "supabase" / ".env"


def read_env(path: Path) -> dict[str, str]:
    """Read a simple dotenv file into a string dictionary."""
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def request_json(
    url: str,
    key: str,
    method: str,
    payload: dict[str, object] | None = None,
    prefer: str = "",
) -> object:
    """Send an authenticated Supabase administration request and decode JSON."""
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    request = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            content = response.read()
            return json.loads(content) if content else {}
    except HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase request failed with HTTP {error.code}: {message}") from error


def derive_username(email: str) -> str:
    """Derive the Workbench username from the super-admin email local part."""
    local_part = email.split("@", 1)[0].strip().lower()
    if len(local_part) < 3:
        return "admin"
    return local_part[:32]


def find_auth_user(base_url: str, key: str, email: str) -> dict[str, object]:
    """Find the existing GoTrue user for the GeoCRM super-admin email."""
    queried = request_json(f"{base_url}/auth/v1/admin/users?email={quote(email)}", key, "GET")
    if isinstance(queried, dict):
        users = queried.get("users")
        if isinstance(users, list):
            for item in users:
                if isinstance(item, dict) and str(item.get("email", "")).lower() == email:
                    return item
        if str(queried.get("email", "")).lower() == email:
            return queried

    for page in range(1, 11):
        listed = request_json(
            f"{base_url}/auth/v1/admin/users?{urlencode({'page': page, 'per_page': 200})}",
            key,
            "GET",
        )
        if not isinstance(listed, dict):
            break
        users = listed.get("users")
        if not isinstance(users, list) or not users:
            break
        for item in users:
            if isinstance(item, dict) and str(item.get("email", "")).lower() == email:
                return item
    raise RuntimeError("The GeoCRM super-admin Auth user was not found")


def merge_app_metadata(user: dict[str, object], username: str, display_name: str) -> dict[str, object]:
    """Return app_metadata that marks the existing Auth user as Workbench super admin."""
    current = user.get("app_metadata")
    merged: dict[str, object] = dict(current) if isinstance(current, dict) else {}
    merged["role"] = "super_admin"
    merged["username"] = username
    merged["display_name"] = display_name
    return merged


def bootstrap() -> None:
    """Link the existing GeoCRM super-admin password login to a Workbench profile."""
    if not SUPABASE_ENV.exists():
        raise RuntimeError("Run scripts/configure-local-env.py before bootstrapping the administrator")
    settings = read_env(SUPABASE_ENV)
    base_url = settings.get("SUPABASE_URL", "").rstrip("/")
    server_key = settings.get("SUPABASE_SECRET_KEY", "") or settings.get("SUPABASE_SERVICE_ROLE_KEY", "")
    email = settings.get("WORKBENCH_SUPER_ADMIN_EMAIL", "").strip().lower()
    username = settings.get("WORKBENCH_ADMIN_USERNAME", "").strip().lower() or derive_username(email)
    display_name = settings.get("WORKBENCH_ADMIN_DISPLAY_NAME", "Super Administrator").strip() or "Super Administrator"
    if not base_url or not server_key or not email:
        raise RuntimeError("The Supabase environment is missing the GeoCRM super-admin identity")

    user = find_auth_user(base_url, server_key, email)
    user_id = user.get("id")
    if not isinstance(user_id, str) or not user_id:
        raise RuntimeError("Supabase did not return the existing administrator identifier")

    request_json(
        f"{base_url}/auth/v1/admin/users/{user_id}",
        server_key,
        "PUT",
        {"app_metadata": merge_app_metadata(user, username, display_name)},
    )
    profile_payload = {
        "display_name": display_name,
        "id": user_id,
        "role": "super_admin",
        "status": "active",
        "username": username,
    }
    existing = request_json(
        f"{base_url}/rest/v1/work_profiles?{urlencode({'id': f'eq.{user_id}', 'select': 'id'})}",
        server_key,
        "GET",
    )
    if isinstance(existing, list) and existing:
        request_json(
            f"{base_url}/rest/v1/work_profiles?id=eq.{user_id}",
            server_key,
            "PATCH",
            profile_payload,
            "return=minimal",
        )
    else:
        request_json(
            f"{base_url}/rest/v1/work_profiles",
            server_key,
            "POST",
            profile_payload,
            "return=minimal",
        )
    print("Linked the existing GeoCRM super-admin Auth user without changing the password.")


if __name__ == "__main__":
    bootstrap()
