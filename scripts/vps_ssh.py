"""SSH helper for the PowerSource Workbench VPS (powersource.work)."""

from __future__ import annotations

from pathlib import Path

import paramiko

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ENV_VPS_PATH = REPOSITORY_ROOT / ".env.vps"


def read_env(path: Path) -> dict[str, str]:
    """Read a simple dotenv file into a string dictionary."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = raw_line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def connect_ssh(timeout: int = 30) -> tuple[paramiko.SSHClient, str, str]:
    """Open an SSH session to the Workbench VPS.

    @returns The client, host, and username.
    """
    settings = read_env(ENV_VPS_PATH)
    host = settings.get("IP", "").strip()
    user = settings.get("Username", "root").strip() or "root"
    password = settings.get("Passwd", "")
    if not host or not password:
        raise RuntimeError("Missing Workbench VPS IP or password in .env.vps")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=host,
        username=user,
        password=password,
        timeout=timeout,
        allow_agent=False,
        look_for_keys=False,
    )
    return client, host, user


def run_ssh(client: paramiko.SSHClient, command: str, timeout: int = 600) -> tuple[int, str, str]:
    """Run a remote command and return exit status plus output.

    @param client - Connected SSH client.
    @param command - Shell command.
    @param timeout - Command timeout in seconds.
    @returns Exit code, stdout, and stderr.
    """
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err
