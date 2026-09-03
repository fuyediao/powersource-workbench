"""Create the first Supabase Auth system administrator without exposing credentials."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
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


def request_json(url: str, key: str, method: str, payload: dict[str, object] | None = None, prefer: str = "") -> object:
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


def bootstrap() -> None:
    """Create the configured administrator in Supabase Auth and its Workbench profile."""
    if not SUPABASE_ENV.exists():
        raise RuntimeError("Run scripts/configure-local-env.py before bootstrapping the administrator")
    settings = read_env(SUPABASE_ENV)
    base_url = settings.get("SUPABASE_URL", "").rstrip("/")
    server_key = settings.get("SUPABASE_SECRET_KEY", "") or settings.get("SUPABASE_SERVICE_ROLE_KEY", "")
    username = settings.get("WORKBENCH_ADMIN_USERNAME", "").strip().lower()
    password = settings.get("WORKBENCH_ADMIN_PASSWORD", "")
    display_name = settings.get("WORKBENCH_ADMIN_DISPLAY_NAME", "System Administrator").strip()
    account_domain = settings.get("WORKBENCH_ACCOUNT_EMAIL_DOMAIN", "accounts.powersource.work").strip()
    if not base_url or not server_key or not username or not password:
        raise RuntimeError("The Supabase environment is missing required administrator settings")

    query = urlencode({"username": f"eq.{username}", "select": "id,role"})
    existing = request_json(f"{base_url}/rest/v1/work_profiles?{query}", server_key, "GET")
    if isinstance(existing, list) and existing:
        if existing[0].get("role") != "system_admin":
            raise RuntimeError("The configured username already exists without the system administrator role")
        print("The Supabase system administrator is already configured.")
        return

    created = request_json(
        f"{base_url}/auth/v1/admin/users",
        server_key,
        "POST",
        {
            "app_metadata": {
                "display_name": display_name,
                "role": "system_admin",
                "username": username,
            },
            "email": f"{username}@{account_domain}",
            "email_confirm": True,
            "password": password,
        },
    )
    if not isinstance(created, dict) or not isinstance(created.get("id"), str):
        raise RuntimeError("Supabase did not return the created administrator identifier")
    request_json(
        f"{base_url}/rest/v1/work_profiles",
        server_key,
        "POST",
        {
            "display_name": display_name,
            "id": created["id"],
            "role": "system_admin",
            "username": username,
        },
        "return=minimal",
    )
    print("Created the Supabase Auth system administrator without printing credentials.")


if __name__ == "__main__":
    bootstrap()
