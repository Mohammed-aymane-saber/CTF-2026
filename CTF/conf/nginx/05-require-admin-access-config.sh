#!/bin/sh
# Runs before the nginx image renders templates: refuse to start with a missing
# or weak admin knock secret, or without an admin allowlist file.
set -eu
if ! printf '%s' "${ADMIN_KNOCK_SECRET:-}" | grep -Eq '^[A-Za-z0-9_-]{24,128}$'; then
  echo "FATAL: ADMIN_KNOCK_SECRET must be set in CTF/conf/nginx/admin-knock.env (24-128 chars, A-Z a-z 0-9 _ -)." >&2
  echo "       Generate one: python3 -c \"import secrets; print(secrets.token_urlsafe(32))\"" >&2
  exit 1
fi
if [ ! -f /etc/nginx/admin-allow.conf ]; then
  echo "FATAL: CTF/conf/nginx/admin-allow.conf is missing." >&2
  echo "       Copy CTF/conf/nginx/admin-allow.conf.example and list the admin networks." >&2
  exit 1
fi
