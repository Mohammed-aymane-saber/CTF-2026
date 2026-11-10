# Admin access: MFA and nginx restrictions

How the CTFd admin panel is protected, how to use it day to day, and how to operate it (new admins, lost phones, secrets, allowlists).

Players are not affected by anything in this document. They log in with a password only and use the public API routes listed in [§6](#6-public-player-api).

---

## 1. Overview

Reaching the admin panel takes **four** checks. Failing either of the first two returns a plain **404**, so the panel looks like it does not exist.

```
Browser
  │
  ▼
nginx (port 80) ─── 1. client IP in admin-allow.conf? ──── no ──► 404
  │                 2. knock cookie (from the secret URL)? ─ no ──► 404
  ▼
CTFd ────────────── 3. password login ──────────────────── no ──► login page
  │                 4. TOTP code (admin_mfa plugin) ─────── no ──► /admin-mfa/verify
  ▼
Admin panel
```

| Layer | Where | What it stops |
|---|---|---|
| 1. Network allowlist | nginx `geo`, `CTF/conf/nginx/admin-allow.conf` | Anyone outside your admin networks, even with the secret |
| 2. Secret knock URL | nginx, `CTF/conf/nginx/admin-knock.env` | Scanners and anyone who doesn't know the URL |
| 3. Password | CTFd | Anyone without the admin's password |
| 4. TOTP code | `CTF/CTFd/plugins/admin_mfa/` | Anyone with a stolen or guessed password |

Layers 1 and 2 also cover the **admin API**. Every `/api/v1` route except the [player routes](#6-public-player-api) needs the allowlisted network and the cookie.

---

## 2. First-time setup

Run from the `CTF/` directory.

```bash
cd CTF

# 1. Knock secret (24–128 chars: A-Z a-z 0-9 _ -). This becomes your admin URL.
python3 -c "import secrets; print('ADMIN_KNOCK_SECRET=' + secrets.token_urlsafe(32))" > conf/nginx/admin-knock.env
chmod 600 conf/nginx/admin-knock.env

# 2. Admin network allowlist: copy the example and edit it.
cp conf/nginx/admin-allow.conf.example conf/nginx/admin-allow.conf

# 3. (Production) a dedicated key for encrypting TOTP secrets: add it to the
#    ctfd service environment as ADMIN_MFA_ENCRYPTION_KEY.
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 4. Start
docker compose up -d --build
```

**Allowlist format** (`admin-allow.conf`), one network per line:

```nginx
100.64.0.0/10 1;    # Tailscale
203.0.113.10  1;    # a fixed admin IP
127.0.0.1     1;    # local
172.16.0.0/12 1;    # local Docker only: remove in production
```

Both files are **git-ignored and docker-ignored**. Never commit them. If either is missing or the secret is weak, nginx **refuses to start** and logs a `FATAL:` line.

---

## 3. Logging in as an admin

1. Open **`http://<host>/<ADMIN_KNOCK_SECRET>`** from an allowlisted network.
   - nginx sets the `admin_knock` cookie (12 h; `HttpOnly`, `Secure`, `SameSite=Strict`) and redirects to `/admin`.
   - Bookmark this URL. To see the secret: `cat CTF/conf/nginx/admin-knock.env`.
2. Log in with your CTFd password.
3. **First time:** you're sent to `/admin-mfa/setup`.
   - Scan the QR code with an authenticator app (Google Authenticator, Aegis, 2FAS…), or type in the key shown.
   - Enter the 6-digit code to confirm.
   - **Save the 10 recovery codes.** They are shown once, and each works once.
4. **Every later login:** enter the current code on `/admin-mfa/verify`.

Logging out ends the MFA session. After 12 h, visit the secret URL again.

---

## 4. Common tasks

### Add another admin

1. Go to **Admin Panel → Users → "+"**.
2. Set **Type = Admin**, give a temporary password, and tick **"Require password change on next login"**.
3. Send them the temporary password and the secret URL over a private channel. Make sure their network is in `admin-allow.conf`.
4. At first login they change the password, then enrol **their own** authenticator.

> Whoever logs in first with that password enrols the phone. Ask new admins to log in promptly.

To promote an existing user, edit the user and set **Type = Admin**; they're sent to MFA setup on their next page. To revoke an admin, set the type back to **User**.

### Lost phone

- **Recovery codes saved:** on `/admin-mfa/verify`, open "Lost your device?" and enter one.
- **No codes:** reset that admin from the server. They re-enrol at next login, and any sessions that already passed MFA end:

  ```bash
  cd CTF
  docker compose exec ctfd python manage.py admin-mfa-reset <admin-email>
  ```

### Change the secret URL

Edit `conf/nginx/admin-knock.env`, then:

```bash
docker compose up -d --force-recreate nginx
```

Existing knock cookies stop working immediately.

### Change the allowlist

Edit `conf/nginx/admin-allow.conf`, then recreate nginx the same way.

> `nginx -s reload` is **not** enough. The compose file mounts these files individually, so the container keeps the old content until it is recreated.

### See who is enrolled

```bash
docker compose exec db mariadb -uctfd -pctfd ctfd \
  -e "SELECT u.name, m.enabled, m.created FROM admin_mfa m JOIN users u ON u.id = m.user_id;"
```

---

## 5. How MFA works

The plugin lives in `CTF/CTFd/plugins/admin_mfa/`. It only adds files; CTFd core is not modified.

| File | Role |
|---|---|
| `gate.py` | Runs before every request; blocks admins who haven't passed MFA |
| `views.py` | `/admin-mfa/setup`, `/setup/done`, `/verify` pages |
| `totp.py` | RFC 6238 TOTP (SHA1, 6 digits, 30 s, ±1 step), standard library only |
| `crypto.py` | Fernet encryption of secrets; salted SHA-256 recovery code hashes |
| `qr.py` | QR code as inline SVG (works under the strict CSP) |
| `models.py`, `migrations/` | `admin_mfa` table, one row per admin |

**The gate.** For a logged-in admin, everything is blocked until MFA passes, apart from the MFA pages, logout, static assets, and the forced password-change page.
- Pages redirect to setup or verify.
- `/api/*` returns `401 {"success": false, "errors": ["MFA verification required"]}`.
- Requests with an **admin API token** (`Authorization` header) get **403** and are logged. Admin work must use an MFA-verified browser session; player tokens still work.

**The "verified" flag.** It lives in the server-side session and is bound to three things:
- the user id
- CTFd's password-hash HMAC, so a password change ends the session
- the enrolment's creation time, so `admin-mfa-reset` ends the session

When MFA passes, the session id is regenerated, so a cookie stolen before MFA stays unverified.

**Replay protection.** Each accepted code stores its time step through an atomic conditional `UPDATE ... WHERE last_counter < :step`. The same code can't be used twice, even by two requests at the same moment. Recovery codes are removed atomically when used.

**Limits and logging.**
- Verify allows 10 POSTs per 5 minutes per IP.
- Enrolment, success, failure, recovery-code use and blocked tokens are written to CTFd's `logins` log.

**Encryption key.** `ADMIN_MFA_ENCRYPTION_KEY` (a Fernet key). If unset, a key is derived from `SECRET_KEY` with HKDF-SHA256 and a warning is logged. Changing the key makes existing enrolments unreadable: verify fails closed and those admins must be reset.

---

## 6. Public (player) API

The config is `CTF/conf/nginx/http.conf.template`.

Only the routes the React frontend calls are open to everyone, and only with these methods:

| Method | Route |
|---|---|
| GET | `/api/v1/challenges`, `/api/v1/challenges/<id>`, `/api/v1/challenges/<id>/solves` |
| POST | `/api/v1/challenges/attempt` |
| GET | `/api/v1/scoreboard` |
| GET | `/api/v1/teams/me`, `/api/v1/teams/me/solves` |
| GET | `/api/v1/users/me`, `/api/v1/users/<id>` |

Every other `/api/v1` route or method returns 404 unless the client passes layers 1 and 2. API paths with dot segments, encoded slashes or doubled slashes are refused for everyone, because nginx checks the normalised path but forwards the raw one.

**When the frontend starts using a new API route,** add a line to `map "$request_method:$uri" $public_api`, recreate nginx, and add the route to `scripts/check-nginx-access.sh`. Otherwise players get a 404.

CTFd's built-in player pages (the old CTFd theme) call more routes, such as hints, unlocks and notifications. Those return 404 publicly, by design: players use the React frontend.

---

## 7. Other nginx rules

- **CSP:** strict everywhere, except `/admin`. The CTFd admin panel needs inline scripts, `eval`, inline styles and `data:` images, so `/admin` relaxes those only.
- **Port 8000** (CTFd direct, bypassing nginx) listens on `127.0.0.1` only. Never expose it.
- `X-Forwarded-For` cannot spoof the allowlist: nginx uses the TCP peer address.

---

## 8. Testing

```bash
# MFA plugin unit and integration tests (from CTF/)
python -m pytest tests/plugins/admin_mfa -q

# nginx access rules against the running stack (from CTF/)
scripts/check-nginx-access.sh                  # client is allowlisted: 32 checks
MODE=denied scripts/check-nginx-access.sh      # client NOT allowlisted: 28 checks
```

The access script tells nginx's own 404 ("blocked") apart from any CTFd response ("passes"). It treats 502/503/504 as failures, so an unhealthy CTFd can't produce a false pass.

**CI** (`.github/workflows/ci.yml`):
- runs the full CTFd test suite, including the plugin tests
- generates a random knock secret for each run
- runs `check-nginx-access.sh` before the ZAP scan

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `/admin` returns a plain 404 | Visit the secret URL first; check your IP is in `admin-allow.conf`; the cookie may have expired (12 h). |
| nginx keeps restarting | `docker compose logs nginx` shows `FATAL:`. The secret or allowlist file is missing or invalid. |
| Changes to nginx files have no effect | Run `docker compose up -d --force-recreate nginx` (reload is not enough). |
| Admin form submits but you get a 404 page | The admin JavaScript isn't running. Check the browser console for CSP errors. |
| "Invalid code" with the right code | Server clock drift (keep it NTP-synced); or the code was already used; or the encryption key changed (reset the admin). |
| A player feature returns 404 | Its API route isn't in the public allowlist (see §6). |
| CTFd crashes with `PermissionError: /opt/CTFd/.env` | Don't create `CTF/.env`. CTF/ is mounted into CTFd and Flask auto-loads it. Use `conf/nginx/admin-knock.env`. |
| Locked out completely | From the server: `docker compose exec ctfd python manage.py admin-mfa-reset <email>`, and check `admin-allow.conf`. |

---

## 10. Production checklist

- [ ] `admin-knock.env` has a fresh production secret (not the dev one)
- [ ] `admin-allow.conf` lists only real admin networks; `172.16.0.0/12` is removed
- [ ] `ADMIN_MFA_ENCRYPTION_KEY` is set for the ctfd service and stored with the other secrets
- [ ] Port 8000 is not reachable from the network
- [ ] Server time is NTP-synced
- [ ] `SAFE_MODE` is **not** enabled (it disables all plugins, including MFA)
- [ ] Every admin has enrolled MFA and saved their recovery codes
- [ ] `scripts/check-nginx-access.sh` passes against the production host, run from an allowlisted machine; `MODE=denied` passes from outside

---

## 11. Files

| Path | Committed | Purpose |
|---|---|---|
| `CTF/CTFd/plugins/admin_mfa/` | yes | MFA plugin |
| `CTF/tests/plugins/admin_mfa/` | yes | Plugin tests |
| `CTF/conf/nginx/http.conf.template` | yes | nginx config (rendered at start-up) |
| `CTF/conf/nginx/05-require-admin-access-config.sh` | yes | Start-up check (secret + allowlist) |
| `CTF/conf/nginx/admin-allow.conf.example` | yes | Allowlist template |
| `CTF/conf/nginx/admin-knock.env.example` | yes | Secret template |
| `CTF/conf/nginx/admin-allow.conf` | **no** | Your allowlist |
| `CTF/conf/nginx/admin-knock.env` | **no** | Your knock secret |
| `CTF/scripts/check-nginx-access.sh` | yes | Access-rule checks |
| `docs/superpowers/specs/2026-11-10-admin-mfa-design.md` | yes | MFA design spec |
