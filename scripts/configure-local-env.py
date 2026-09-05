"""Create ignored Workbench environment files from the .work VPS Supabase stack."""

from __future__ import annotations

import argparse
from pathlib import Path

from vps_ssh import connect_ssh, read_env, run_ssh

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
VPS_ENV = REPOSITORY_ROOT / ".env.vps"
DESKTOP_ENV = REPOSITORY_ROOT / "desktop" / ".env"
BACKEND_ENV = REPOSITORY_ROOT / "backend" / ".env"

REMOTE_SUPABASE_ENV = "/opt/supabase-project/.env"


def write_private_env(path: Path, lines: list[str], replace: bool) -> None:
    """Write an ignored environment file with optional replacement."""
    if path.exists() and not replace:
        raise RuntimeError(f"Refusing to overwrite existing environment file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    path.chmod(0o600)


def load_remote_supabase_env() -> dict[str, str]:
    """Read the Workbench VPS Supabase dotenv without printing values."""
    client, _host, _user = connect_ssh()
    try:
        code, out, err = run_ssh(client, f"cat {REMOTE_SUPABASE_ENV}")
        if code != 0:
            raise RuntimeError(f"Unable to read {REMOTE_SUPABASE_ENV}: {err.strip()}")
    finally:
        client.close()
    values: dict[str, str] = {}
    for raw_line in out.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def configure(replace: bool = False) -> None:
    """Create desktop and backend environment files for .work."""
    if not VPS_ENV.exists():
        raise RuntimeError(f"Missing VPS environment file: {VPS_ENV}")

    vps = read_env(VPS_ENV)
    domain = vps.get("URL", "").removeprefix("https://").removeprefix("http://").strip().rstrip("/")
    if not domain.endswith(".work"):
        raise RuntimeError("The VPS URL must identify the PowerSource .work deployment")

    remote = load_remote_supabase_env()
    publishable_key = remote.get("ANON_KEY", "").strip()
    server_key = remote.get("SERVICE_ROLE_KEY", "").strip()
    if not publishable_key or not server_key:
        raise RuntimeError("The Workbench Supabase stack is missing ANON_KEY or SERVICE_ROLE_KEY")

    supabase_url = f"https://supabase.{domain}"
    api_url = f"https://api.{domain}"

    write_private_env(
        DESKTOP_ENV,
        [
            f"VITE_DEPLOYMENT_DOMAIN={domain}",
            f"VITE_SUPABASE_URL={supabase_url}",
            f"VITE_SUPABASE_PUBLISHABLE_KEY={publishable_key}",
            f"VITE_WORKBENCH_API_URL={api_url}",
        ],
        replace,
    )
    write_private_env(
        BACKEND_ENV,
        [
            "PORT=3001",
            f"SUPABASE_URL={supabase_url}",
            f"SUPABASE_PUBLIC_URL={supabase_url}",
            f"SUPABASE_ANON_KEY={publishable_key}",
            f"SUPABASE_SERVICE_ROLE_KEY={server_key}",
        ],
        replace,
    )
    print("Created Workbench .work environment files without printing credential values.")


def parse_arguments() -> argparse.Namespace:
    """Parse command-line options for environment generation."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replace", action="store_true", help="Replace environment files created by this script")
    return parser.parse_args()


if __name__ == "__main__":
    configure(parse_arguments().replace)
