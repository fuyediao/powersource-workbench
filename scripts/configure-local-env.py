"""Create ignored direct-Supabase environment files from the existing deployment configuration."""

from __future__ import annotations

import argparse
from pathlib import Path
import re


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CRM_BACKEND_ENV = REPOSITORY_ROOT.parent / "CRM" / "backend" / ".env"
VPS_ENV = REPOSITORY_ROOT / ".env.vps"
DESKTOP_ENV = REPOSITORY_ROOT / "desktop" / ".env"
SUPABASE_ENV = REPOSITORY_ROOT / "supabase" / ".env"
BACKEND_ENV = REPOSITORY_ROOT / "backend" / ".env"


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


def normalize_domain(value: str) -> str:
    """Normalize a deployment URL setting into a bare hostname."""
    return value.removeprefix("https://").removeprefix("http://").strip().rstrip("/")


def derive_admin_username(email: str) -> str:
    """Derive a valid Workbench username from the existing administrator identity."""
    local_part = email.split("@", 1)[0].strip().lower()
    normalized = re.sub(r"[^a-z0-9._-]+", ".", local_part).strip("._-")
    if len(normalized) < 3:
        return "admin"
    return normalized[:32]


def write_private_env(path: Path, lines: list[str], replace: bool) -> None:
    """Write an ignored environment file with optional replacement."""
    if path.exists() and not replace:
        raise RuntimeError(f"Refusing to overwrite existing environment file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    path.chmod(0o600)


def configure(replace: bool = False) -> None:
    """Create desktop and Supabase runtime environment files."""
    if not CRM_BACKEND_ENV.exists():
        raise RuntimeError(f"Missing source environment file: {CRM_BACKEND_ENV}")
    if not VPS_ENV.exists():
        raise RuntimeError(f"Missing VPS environment file: {VPS_ENV}")

    source = read_env(CRM_BACKEND_ENV)
    vps = read_env(VPS_ENV)
    domain = normalize_domain(vps.get("URL", ""))
    if not domain.endswith(".work"):
        raise RuntimeError("The VPS URL must identify the PowerSource .work deployment")

    publishable_key = source.get("SUPABASE_PUBLISHABLE_KEY", "").strip() or source.get("SUPABASE_ANON_KEY", "").strip()
    if not publishable_key:
        raise RuntimeError("The source environment has no Supabase publishable key")
    secret_key = source.get("SUPABASE_SECRET_KEY", "").strip()
    legacy_service_role_key = source.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    server_key = secret_key or legacy_service_role_key
    if not server_key:
        raise RuntimeError("The source environment has no Supabase server key")
    server_key_name = "SUPABASE_SECRET_KEY" if secret_key else "SUPABASE_SERVICE_ROLE_KEY"

    super_admin_email = (
        source.get("SUPER_ADMIN_EMAIL", "").strip().lower()
        or (source.get("SYSTEM_ADMIN_EMAILS", "").split(",")[0].strip().lower() if source.get("SYSTEM_ADMIN_EMAILS") else "")
        or "contact@geocrm.org"
    )
    admin_username = derive_admin_username(super_admin_email)
    supabase_url = source.get("SUPABASE_PUBLIC_URL", "").strip().rstrip("/") or "https://supabase.powersource.app"
    account_domain = f"accounts.{domain}"

    write_private_env(
        DESKTOP_ENV,
        [
            f"VITE_DEPLOYMENT_DOMAIN={domain}",
            f"VITE_SUPABASE_URL={supabase_url}",
            f"VITE_SUPABASE_PUBLISHABLE_KEY={publishable_key}",
            "VITE_WORKBENCH_API_URL=http://127.0.0.1:3010",
        ],
        replace,
    )
    write_private_env(
        BACKEND_ENV,
        [
            "PORT=3010",
            f"SUPABASE_URL={supabase_url}",
            f"SUPABASE_ANON_KEY={publishable_key}",
            f"{server_key_name}={server_key}",
            f"SUPER_ADMIN_EMAIL={super_admin_email}",
            f"WORKBENCH_ACCOUNT_EMAIL_DOMAIN={account_domain}",
        ],
        replace,
    )
    write_private_env(
        SUPABASE_ENV,
        [
            f"SUPABASE_URL={supabase_url}",
            f"SUPABASE_PUBLISHABLE_KEY={publishable_key}",
            f"{server_key_name}={server_key}",
            f"WORKBENCH_ACCOUNT_EMAIL_DOMAIN={account_domain}",
            f"WORKBENCH_SUPER_ADMIN_EMAIL={super_admin_email}",
            f"WORKBENCH_ADMIN_USERNAME={admin_username}",
            "WORKBENCH_ADMIN_DISPLAY_NAME=Super Administrator",
        ],
        replace,
    )
    print("Created direct-Supabase environment files without printing credential values.")


def parse_arguments() -> argparse.Namespace:
    """Parse command-line options for local environment generation."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replace", action="store_true", help="Replace environment files created by this script")
    return parser.parse_args()


if __name__ == "__main__":
    configure(parse_arguments().replace)
