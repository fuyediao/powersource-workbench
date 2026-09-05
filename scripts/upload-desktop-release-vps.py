#!/usr/bin/env python3
"""Upload a local desktop installer into the Workbench desktop-releases bucket.

Copies the file over SSH, then POSTs it to supabase-storage with the
service role. Destination object: {platform}/{release}/{file_name}.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from vps_ssh import connect_ssh, run_ssh

BUCKET = "desktop-releases"
REMOTE_STAGING = "/tmp/workbench-desktop-upload"


def main() -> int:
    """Upload one installer to the Workbench VPS Storage bucket."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("local_file", type=Path, help="Installer on this machine")
    parser.add_argument("platform", choices=("macos-m", "macos-i", "windows"))
    parser.add_argument("release", help="Folder id such as beta0.1.0")
    parser.add_argument(
        "--name",
        default="",
        help="Object file name (default: workbench.dmg or workbench.exe)",
    )
    args = parser.parse_args()
    local = args.local_file.expanduser().resolve()
    if not local.is_file():
        print(f"Missing {local}", file=sys.stderr)
        return 1

    dest_name = args.name.strip() or (
        "workbench.exe" if args.platform == "windows" else "workbench.dmg"
    )
    object_path = f"{args.platform}/{args.release}/{dest_name}"
    remote_file = f"{REMOTE_STAGING}/{dest_name}"
    size_mb = local.stat().st_size / (1024 * 1024)
    print(f"Local {local} ({size_mb:.1f} MiB)")
    print(f"Remote {BUCKET}/{object_path}")

    client, host, user = connect_ssh()
    print(f"Connected {user}@{host}")

    code, _, err = run_ssh(client, f"mkdir -p {REMOTE_STAGING}")
    if code != 0:
        print(err, file=sys.stderr)
        client.close()
        return code

    skip_sftp = False
    code, out, _ = run_ssh(client, f"stat -c %s {remote_file} 2>/dev/null || true")
    remote_size = out.strip()
    if remote_size.isdigit() and int(remote_size) == local.stat().st_size:
        skip_sftp = True
        print("Staged file already on VPS; skipping SFTP.")

    if not skip_sftp:
        print("Uploading over SFTP ...")
        sftp = client.open_sftp()
        last_pct = -1

        def progress(transferred: int, total: int) -> None:
            nonlocal last_pct
            if total <= 0:
                return
            pct = transferred * 100 // total
            if pct >= last_pct + 10 or transferred == total:
                last_pct = pct
                print(
                    f"  {pct}% ({transferred // (1024 * 1024)} / "
                    f"{total // (1024 * 1024)} MiB)"
                )

        sftp.put(str(local), remote_file, callback=progress)
        sftp.close()
        print("SFTP done.")

    print("Posting to Storage ...")

    upload_cmd = f"""
set -euo pipefail
KEY=$(grep -E '^SERVICE_ROLE_KEY=' /opt/supabase-project/.env | cut -d= -f2- | tr -d '\\r')
IP=$(docker inspect -f '{{{{range .NetworkSettings.Networks}}}}{{{{.IPAddress}}}}{{{{end}}}}' supabase-storage)
curl -sS -f --http1.1 --max-time 1800 \\
  -X POST "http://$IP:5000/object/{BUCKET}/{object_path}" \\
  -H "Authorization: Bearer $KEY" \\
  -H "apikey: $KEY" \\
  -H "Content-Type: application/octet-stream" \\
  -H "x-upsert: true" \\
  --data-binary @{remote_file}
echo
rm -f {remote_file}
"""
    code, out, err = run_ssh(client, upload_cmd, timeout=2000)
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    if code != 0:
        print(f"Storage upload failed (exit {code})", file=sys.stderr)
        client.close()
        return code

    verify = (
        "docker exec -i supabase-db psql -U postgres -d postgres -c "
        f"\"SELECT name, metadata->>'size' AS size FROM storage.objects "
        f"WHERE bucket_id = '{BUCKET}' AND name = '{object_path}';\""
    )
    code2, out2, err2 = run_ssh(client, verify, timeout=30)
    print(out2)
    if err2.strip():
        print(err2, file=sys.stderr)
    client.close()
    if code2 != 0:
        return code2
    print(f"OK: {object_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
