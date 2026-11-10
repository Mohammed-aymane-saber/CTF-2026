#!/usr/bin/env bash
# Checks the nginx access rules of the running stack (docker compose up -d).
#
#   scripts/check-nginx-access.sh            # client IP is in admin-allow.conf
#   MODE=denied scripts/check-nginx-access.sh  # client IP is NOT in admin-allow.conf
#
# "blocked" = nginx's own 404 (request never reached CTFd).
# "passes"  = any response produced by CTFd (status may be 200/302/401/403/404).
set -u
cd "$(dirname "$0")/.."

BASE="${BASE:-http://localhost}"
MODE="${MODE:-allowed}"
SECRET="$(sed -n 's/^ADMIN_KNOCK_SECRET=//p' conf/nginx/admin-knock.env 2>/dev/null | tail -1)"
[ -n "$SECRET" ] || { echo "ADMIN_KNOCK_SECRET missing from CTF/conf/nginx/admin-knock.env"; exit 2; }
GOOD="Cookie: admin_knock=$SECRET"
BAD="Cookie: admin_knock=wrong-${SECRET}"

pass=0; fail=0
ok()  { pass=$((pass + 1)); printf '  ok    %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '  FAIL  %s  (%s)\n' "$1" "$2"; }

# request METHOD PATH [extra curl args...] -> sets $status, $body, $headers
request() {
  local method="$1" path="$2"; shift 2
  local tmp; tmp="$(mktemp -d)"
  status="$(curl -s --max-time 10 --path-as-is -X "$method" -o "$tmp/body" -D "$tmp/headers" \
    -w '%{http_code}' "$@" "$BASE$path")"
  body="$(cat "$tmp/body" 2>/dev/null)"; headers="$(cat "$tmp/headers" 2>/dev/null)"; rm -rf "$tmp"
}
is_nginx_404() { [ "$status" = 404 ] && grep -q '<center>nginx</center>' <<<"$body"; }

blocked() { local d="$1"; shift; request "$@"; if is_nginx_404; then ok "blocked: $d"; else bad "blocked: $d" "got $status from CTFd"; fi; }
passes()  {
  local d="$1"; shift; request "$@"
  if is_nginx_404; then bad "passes:  $d" "nginx 404"
  elif [[ "$status" =~ ^(000|502|503|504)$ ]]; then bad "passes:  $d" "upstream unreachable ($status)"
  else ok "passes:  $d ($status)"; fi
}

echo "== public routes (any client)"
passes "GET /login"                         GET  /login
passes "GET /api/v1/challenges"             GET  /api/v1/challenges
passes "GET /api/v1/challenges/1"           GET  /api/v1/challenges/1
passes "GET /api/v1/challenges/1/solves"    GET  /api/v1/challenges/1/solves
passes "POST /api/v1/challenges/attempt"    POST /api/v1/challenges/attempt -H 'Content-Type: application/json' -d '{}'
passes "GET /api/v1/scoreboard"             GET  /api/v1/scoreboard
passes "GET /api/v1/teams/me"               GET  /api/v1/teams/me
passes "GET /api/v1/teams/me/solves"        GET  /api/v1/teams/me/solves
passes "GET /api/v1/users/me"               GET  /api/v1/users/me
passes "GET /api/v1/users/2"                GET  /api/v1/users/2
passes "GET /administrator (not admin)"     GET  /administrator

echo "== admin-only routes without the knock cookie"
blocked "GET /admin"                        GET    /admin
blocked "GET /admin/users/new"              GET    /admin/users/new
blocked "GET /admin-mfa/setup"              GET    /admin-mfa/setup
blocked "GET /api/v1/configs"               GET    /api/v1/configs
blocked "GET /api/v1/users (list)"          GET    /api/v1/users
blocked "POST /api/v1/users"                POST   /api/v1/users -H 'Content-Type: application/json' -d '{}'
blocked "DELETE /api/v1/challenges/1"       DELETE /api/v1/challenges/1
blocked "PATCH /api/v1/users/me"            PATCH  /api/v1/users/me -H 'Content-Type: application/json' -d '{}'
blocked "GET /api/v1/ (API root)"           GET    /api/v1/
blocked "dot-segment smuggling"             GET    '/api/v1/configs/../users/me'
blocked "encoded slash smuggling"           GET    '/api/v1/users/me%2F..%2F..%2Fconfigs'
blocked "wrong knock cookie on /admin"      GET    /admin -H "$BAD"
blocked "wrong knock cookie on API"         GET    /api/v1/configs -H "$BAD"
blocked "spoofed X-Forwarded-For"           GET    /api/v1/configs -H 'X-Forwarded-For: 100.64.0.1'

if [ "$MODE" = allowed ]; then
  echo "== knock + admin access (client IP allowlisted)"
  request GET "/$SECRET"
  if [ "$status" = 302 ] && grep -qi '^location: .*/admin' <<<"$headers" \
     && grep -qi "^set-cookie: admin_knock=$SECRET;.*HttpOnly.*Secure.*SameSite=Strict" <<<"$headers"; then
    ok "knock URL sets cookie and redirects to /admin"
  else
    bad "knock URL sets cookie and redirects to /admin" "status $status"
  fi
  passes "GET /admin with cookie"           GET    /admin -H "$GOOD"
  passes "GET /admin-mfa/setup with cookie" GET    /admin-mfa/setup -H "$GOOD"
  passes "GET /api/v1/configs with cookie"  GET    /api/v1/configs -H "$GOOD"
  passes "DELETE /api/v1/challenges/1 w/ cookie" DELETE /api/v1/challenges/1 -H "$GOOD"
  request GET /admin -H "$GOOD"
  if grep -qi "^content-security-policy:.*'unsafe-inline'" <<<"$headers"; then ok "admin CSP relaxed"; else bad "admin CSP relaxed" "header missing"; fi
  request GET /login
  if grep -qi "^content-security-policy:.*'unsafe-inline'" <<<"$headers"; then bad "public CSP strict" "unsafe-inline on /login"; else ok "public CSP strict"; fi
else
  echo "== client IP NOT allowlisted"
  blocked "knock URL"                       GET /"$SECRET"
  blocked "GET /admin even with cookie"     GET /admin -H "$GOOD"
  blocked "admin API even with cookie"      GET /api/v1/configs -H "$GOOD"
fi

echo "== ${pass} passed, ${fail} failed"
[ "$fail" = 0 ]
