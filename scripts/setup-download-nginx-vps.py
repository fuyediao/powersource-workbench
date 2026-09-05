#!/usr/bin/env python3
"""Issue Let's Encrypt TLS and a Baota nginx vhost for download.powersource.work.

The vhost proxies GET/HEAD installer feeds to workbench-api on 127.0.0.1:3001
so https://download.powersource.work/macos-m/beta0.1.0 reaches the same
handlers as https://api.powersource.work/macos-m/beta0.1.0.
"""
from __future__ import annotations

from vps_ssh import connect_ssh, run_ssh

DOMAIN = "download.powersource.work"
CERT_DIR = f"/www/server/panel/vhost/cert/{DOMAIN}"
ACME_ROOT = f"/www/wwwroot/{DOMAIN}"
NGINX_CONF = f"/www/server/panel/vhost/nginx/{DOMAIN}.conf"


def nginx_download_vhost() -> str:
    """Return the nginx config that proxies download.{domain} to workbench-api."""
    return f"""server {{
    listen 80;
    server_name {DOMAIN};

    location /.well-known/acme-challenge/ {{
        root {ACME_ROOT};
    }}

    location / {{
        return 301 https://$host$request_uri;
    }}
}}

server {{
    listen 443 ssl;
    http2 on;
    server_name {DOMAIN};
    root {ACME_ROOT};

    ssl_certificate    {CERT_DIR}/fullchain.pem;
    ssl_certificate_key    {CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000" always;
    error_page 497 https://$host$request_uri;

    location /.well-known/acme-challenge/ {{
        root {ACME_ROOT};
    }}

    location / {{
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        client_max_body_size 64m;
        proxy_read_timeout 120s;
    }}

    access_log /www/wwwlogs/{DOMAIN}.log;
    error_log /www/wwwlogs/{DOMAIN}.error.log;
}}
"""


def main() -> int:
    """Write the download.powersource.work vhost and request a certificate."""
    client, host, user = connect_ssh()
    print(f"{user}@{host}")

    nginx_conf = nginx_download_vhost()
    script = f"""
set -euo pipefail
DOMAIN='{DOMAIN}'
WEBROOT="{ACME_ROOT}"
CERT_DIR="{CERT_DIR}"
NGINX_CONF="{NGINX_CONF}"
mkdir -p "${{WEBROOT}}/.well-known/acme-challenge" "${{CERT_DIR}}"

cat > "$NGINX_CONF" << 'NGINX_HTTP'
server {{
    listen 80;
    server_name {DOMAIN};

    location /.well-known/acme-challenge/ {{
        root {ACME_ROOT};
    }}

    location / {{
        return 301 https://$host$request_uri;
    }}
}}
NGINX_HTTP

/www/server/nginx/sbin/nginx -t
/etc/init.d/nginx reload

certbot certonly --webroot -w "${{WEBROOT}}" -d "${{DOMAIN}}" \\
  --non-interactive --agree-tos -m admin@powersource.work --preferred-challenges http

if [ ! -f "/etc/letsencrypt/live/${{DOMAIN}}/fullchain.pem" ]; then
  echo "certbot did not write /etc/letsencrypt/live/${{DOMAIN}}/fullchain.pem" >&2
  exit 1
fi

cp -L "/etc/letsencrypt/live/${{DOMAIN}}/fullchain.pem" "${{CERT_DIR}}/fullchain.pem"
cp -L "/etc/letsencrypt/live/${{DOMAIN}}/privkey.pem" "${{CERT_DIR}}/privkey.pem"

cat > "$NGINX_CONF" << 'NGINXEOF'
{nginx_conf}
NGINXEOF

/www/server/nginx/sbin/nginx -t
/etc/init.d/nginx reload
echo DOWNLOAD_NGINX_OK
"""

    code, out, err = run_ssh(client, script, timeout=300)
    if out:
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())
    print(f"exit={code}")
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
