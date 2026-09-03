"""Probe Workbench VPS SSH without printing credentials."""

from __future__ import annotations

from vps_ssh import connect_ssh, run_ssh


def main() -> int:
    """Connect and print hostname plus workbench/supabase container names."""
    client, host, user = connect_ssh(timeout=20)
    print(f"ok {user}@{host[:3]}...")
    code, out, err = run_ssh(
        client,
        "hostname; docker ps --format '{{.Names}}' | grep -E 'workbench|kong|supabase-db' || true",
        timeout=30,
    )
    print("code", code)
    if out:
        print(out.rstrip())
    if err:
        print(err.rstrip())
    client.close()
    return 0 if code == 0 else code


if __name__ == "__main__":
    raise SystemExit(main())
