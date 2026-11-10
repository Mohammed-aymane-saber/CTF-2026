# Pre-Production Security Review

**Date:** 2026-11-06
**Scope:** `CTF/` (CTFd 3.8.9, vendored), `frontend/` (Vite + React, served via nginx), the reference `CTF/docker-compose.yml`, and the dependency findings from the earlier Trivy accuracy review.
**Method:** Static code review (offline mode — no live target, no traffic generated). Five parallel audits covering auth/session, API access control, injection/upload, infra/Docker/nginx/secrets, and CTFd-specific hardening, synthesized below. Every finding is cited to a file and line; nothing here is a guess.

**Context that shapes this whole review:** per `PLAN.md:7`, the previous edition of this platform ran CTFd 3.8.2 with custom code and is believed to have been compromised. This repo is a from-scratch rebuild with no history or secrets carried over, and `PLAN.md` already tracks the production hardening work as phases 4–6 (nginx split, Docker/secrets, CI+Trivy+gitleaks), all currently "à faire." This review's job is to make that remaining work concrete and prioritized, not to relitigate it.

---

## Part A — What could actually harm you (prioritized by real reachability, not raw CVSS)

### Tier 1 — Fix before any public exposure

**1. Hardcoded, root-equivalent DB credentials committed to git**
`CTF/docker-compose.yml:9,54-57` — `DATABASE_URL=mysql+pymysql://ctfd:ctfd@db/ctfd`, `MARIADB_ROOT_PASSWORD=ctfd`.
*Why it matters:* this is CTFd's own upstream reference compose, explicitly marked in `PLAN.md:44` as "reference only" — but reference files get copied under deadline pressure. If it ever becomes the real compose as-is, any container compromise or internal-network foothold yields instant DB root with a password a dictionary attack guesses in one try.
*Fix:* the production compose (phase 5) must generate `MARIADB_ROOT_PASSWORD`, `MARIADB_PASSWORD`, `SECRET_KEY` with `openssl rand -hex 32` (already specified in `PLAN.md:116`) and inject them via `.env`/secrets manager — never literals in a tracked file. Delete or clearly quarantine `CTF/docker-compose.yml` once the real one exists, to remove the temptation.

**2. No TLS/HTTPS anywhere in the repository**
`CTF/conf/nginx/http.conf:12` and `frontend/Dockerfile:26` both `listen 80` only; zero matches anywhere for `ssl_certificate`/`listen 443`/certbot.
*Why it matters:* session cookies, the CSRF nonce, login credentials, and admin session tokens travel in plaintext the moment this is reachable over a network that isn't already TLS-terminated elsewhere. Trivial MITM session theft on campus wifi, a conference network, anywhere.
*Fix:* terminate TLS at the edge (nginx+certbot, or an upstream load balancer/CDN) and force HTTP→HTTPS redirect before any public exposure. This is already tracked at `PLAN.md:161`.

**3. Session cookie never marked `Secure`**
`CTF/CTFd/config.py:150-153` sets `SESSION_COOKIE_HTTPONLY=True` and `SESSION_COOKIE_SAMESITE="Lax"` but never sets `SESSION_COOKIE_SECURE` — it silently inherits Flask's default of `False`.
*Why it matters:* compounds directly with #2 — even after you add TLS, if this flag isn't set the browser will still happily send the session cookie over a plaintext connection if one ever gets established (redirect race, user typing `http://`, a misconfigured hop).
*Fix:* add `SESSION_COOKIE_SECURE = True` to `ServerConfig` in `CTF/CTFd/config.py`. One line, zero risk, do it now regardless of TLS timing.

**4. `frontend/Dockerfile` final stage runs nginx as root**
No `USER` instruction in the nginx stage. (Covered in the earlier Trivy/config review — restated here for a complete checklist.)
*Fix:* switch to `nginxinc/nginx-unprivileged` (binds 8080 by default) or add a dedicated user + `chown` the relevant paths + move off port 80, as detailed in the earlier patch-plan message.

### Tier 2 — Fix before the event goes live (not an open door, but real weaknesses)

**5. No security headers on either nginx config**
Checked `frontend/Dockerfile:24-91` and `CTF/conf/nginx/http.conf:1-56` — only `Cache-Control`/`Content-Type` are set. No CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or (once TLS exists) HSTS.
*Fix:*
```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; ..." always;
# add Strict-Transport-Security once TLS (Tier 1 #2) is live
```

**6. Password minimum length defaults to 0**
`CTF/CTFd/auth.py:161-162,273` — `password_min_length = int(get_config("password_min_length", default=0))`; only a fully empty string is rejected. Unless an admin explicitly sets this in Admin Settings before registration opens, 1-character passwords are accepted.
*Fix:* hardcode a floor (8+) instead of defaulting to 0, or enforce it as a mandatory `/setup` field.

**7. Login brute-force throttling is IP-keyed only, not per-account**
`CTF/CTFd/auth.py:443` — `@ratelimit(method="POST", limit=10, interval=5)`, keyed on `ip_address:endpoint` with no per-username failure counter (contrast with `/reset_password`, which correctly does `cache.inc(f"reset_password_attempt_user_{user.id}")` at line 214-216).
*Fix:* port the same per-user counter pattern from `reset_password()` into `login()`.

**8. No CAPTCHA/anti-automation on registration**
Zero matches for `recaptcha|captcha|hcaptcha|turnstile` anywhere in the codebase; `/register` only has the same generic IP rate limit as login (`auth.py:236-239`).
*Why it matters:* a slow-drip script or small proxy pool can mass-register accounts over an event's duration with no real friction — scraping gated challenge content, polluting the scoreboard, or exhausting team-size limits.
*Fix:* add hCaptcha/Cloudflare Turnstile on `/register`, and/or require email-domain allowlisting or manual admin approval if this is a closed/invite competition.

**9. Zero audit trail for admin actions**
`CTF/CTFd/utils/initialization/__init__.py:142-190` wires up exactly three loggers: `submissions`, `logins`, `registrations`. No admin-action logging exists anywhere — challenge create/edit/delete (`challenges.py:276-297,606-628,635-643`) and user ban/unban/delete (`users.py:233-271`) never call `log(...)`.
*Why it matters:* if an admin account is phished mid-competition, or a co-organizer disputes an action (challenge value silently changed, a team unbanned, a flag edited), there is currently zero forensic record of who did what, when. Given this platform's history (suspected prior compromise), this is the single highest-value cheap fix in the whole review.
*Fix:* add a fourth `admin` `RotatingFileHandler` logger in `init_logs`, call `log("admin", ...)` in every `@admins_only`-gated mutating endpoint, recording actor id, action, target id, before/after values.

**10. Reference nginx has no route whitelist — proxies everything, including `/admin/*`**
`CTF/conf/nginx/http.conf:30-42` — `location /` proxies all paths to CTFd unconditionally.
*Fix:* this is exactly phase 4 in `PLAN.md:71` — a `public.conf` whitelist derived from `frontend/src/api.js`'s real calls, plus a separate `admin.conf` reachable only from localhost/VPN. Treat as a hard gate, not optional hardening.

**11. No request body size cap at the Flask level**
No `MAX_CONTENT_LENGTH` in `CTF/CTFd/config.py`; `CTF/conf/nginx/http.conf:25` allows `client_max_body_size 4G`.
*Why it matters:* admin-gated (file upload/backup-import routes require `@admins_only`), so this is a disk-exhaustion DoS only reachable by a compromised/malicious admin, not a player — still cheap to close.
*Fix:* set `MAX_CONTENT_LENGTH` in `config.py` to a sane ceiling for your largest expected challenge file, and lower `client_max_body_size` to match.

### Tier 3 — Hygiene / defense-in-depth (no current attacker path, but fragile patterns worth closing)

**12.** F-string-built raw SQL in the admin-only backup import/export flow (`CTF/CTFd/utils/exports/__init__.py:247,399-400,413-416`) — all three inputs are currently constrained to safe values (an int-cast ID, a MySQL-internal process ID, a quote-filtered table name), so this is **not** exploitable today, but it's one refactor away from being SQLi with no parameterization safety net. Switch to `text(...).bindparams(...)`.

**13.** No file-extension/MIME allowlist on the admin-only challenge-file upload endpoint (`api/v1/files.py`). Low impact because it's `@admins_only` and downloads are forced `as_attachment=True` (so a malicious uploaded `.html`/`.svg` won't render inline same-origin) — but add an allowlist anyway, since "admin-only today" can become "admin + co-organizer with less vetting" tomorrow.

**14.** Floating `nginx:stable` tag in the reference compose (`CTF/docker-compose.yml:41`) vs. the correctly pinned `nginx:1.27.4-alpine` in `frontend/Dockerfile:5`. Pin it for reproducible builds.

**15.** Redis in the reference compose is EOL (4.x) and has no `requirepass`, but is confirmed confined to the `internal: true` Docker network with no published port (`docker-compose.yml:66-77`) — lateral-movement risk only if another container on that network is already compromised. Bump the version and set `requirepass` anyway.

**16.** `CTF/.flaskenv` ships `FLASK_ENV=development` into the image. Verified this is **not** currently exploitable — `FLASK_ENV` is never read in `config.py`/`__init__.py`, and `DEBUG=True` only exists in `TestingConfig`, never used by the Gunicorn entrypoint. Residual risk only if someone `docker exec`s in and manually runs `flask run`/`flask shell`. Exclude it via `.dockerignore` or set it to `production`.

**17.** Preset admin password (`PRESET_ADMIN_PASSWORD` env var) is compared with plain `==` (not constant-time) at `auth.py:452-459`, and sits in clear text in the container environment if used for bootstrap. Use `hmac.compare_digest`; rotate/unset this var immediately after first admin login.

**18.** The dependency CVEs from the earlier Trivy report (Pillow, cryptography, urllib3, Flask/Werkzeug, and the theme `yarn.lock` packages) — already established in this conversation that **none have a player-reachable path today** (Pillow's only `Image.open()` call processes an admin-configured logo; the core theme's flagged packages are all build-time-only or dead code; Werkzeug's debugger RCE needs debug mode, which is off in production). Still worth patching for hygiene and because code can change — see the patch plan already given, and wire it into `PLAN.md` phase 6 (CI + Trivy + Dependabot) so it's continuous rather than one-time.

---

## Part B — What's already solid (confirmed by code, not assumed)

To keep this review honest and not just a wall of alarms — the following were specifically checked and found correctly implemented:

- **CSRF** is globally enforced via a `before_request` hook (`utils/initialization/__init__.py:391-405`) checking a session-bound nonce against every non-safe-method request lacking an `Authorization` header.
- **Password hashing** uses `passlib.hash.bcrypt_sha256` with a modern work factor (`utils/crypto/__init__.py:8-13`).
- **Password reset/email-confirm tokens** are `os.urandom(32)` (256-bit), cache-backed, single-use, 30-minute expiry.
- **`/setup` cannot be re-triggered** post-initial-setup (`views.py:67`) — no path to reset admin credentials via the setup flow.
- **Session fixation is defended** — `session.regenerate()` runs before `login_user()` on successful login.
- **Reverse-proxy real-IP handling is correct** — `TRUSTED_PROXIES` + Werkzeug `ProxyFix` correctly recover the real client IP through the nginx hop; rate limiting isn't silently broken or spoofable via `X-Forwarded-For`.
- **Mass assignment is blocked** by marshmallow field whitelisting (`schemas/users.py:363-409`) — a player cannot smuggle `type: admin` through their own profile PATCH.
- **IDOR/BOLA**: sampled object-access endpoints (users, teams, hints, submissions) check ownership server-side, not just "is authenticated."
- **Zip-slip is explicitly guarded** in the backup-import pipeline (`utils/exports/__init__.py:147-157`) — the exact bug class CTFd had a historical issue with is patched here, and the route is admin-only regardless.
- **No player-reachable injection**: SQLAlchemy Core/ORM is used consistently; the one custom string-formatting utility (`safe_html_format`) is correctly SSTI-safe (regex substitution + `markupsafe.escape_silent`, not `str.format()` on user input); the only `subprocess` call uses list-form `Popen` with no shell interpolation.
- **Flag brute-force protection exists and is well-designed**: Redis-backed, per-account-per-challenge, atomically incremented, returns 429 on exceeding `incorrect_submissions_per_min` (default 10/min, admin-tunable) — this is a config-tuning item (make sure it's deliberately set for your flag format), not a missing control.
- **Plugin loading is filesystem-only at process startup** — there is no runtime "install plugin via admin panel" path in this vendored version, so a compromised admin cannot inject new Python code through the web UI alone. Admin remains a full trust boundary by design (DB access, file serving, user management) — mitigate operationally (strong unique credentials, minimal admin headcount), not by code patch.
- **No secrets found committed to git** beyond the known-reference `docker-compose.yml` passwords above; `.ctfd_secret_key` is correctly gitignored and dockerignored; no `.env` files are tracked.

---

## Part C — Consolidated pre-production checklist

This extends `PLAN.md` §9 ("Avant l'événement") with everything from this review. Treat Tier 1 as blocking; Tier 2 as required before opening registration; Tier 3 as due diligence.

### Blocking (do before any network exposure, even internal/staging)
- [ ] Generate real secrets (`SECRET_KEY`, DB password, Redis password) with `openssl rand -hex 32`; never reuse `CTF/docker-compose.yml`'s literals.
- [ ] TLS terminated at the edge; HTTP→HTTPS redirect enforced.
- [ ] `SESSION_COOKIE_SECURE = True` added to `CTF/CTFd/config.py`.
- [ ] `frontend/Dockerfile` nginx stage runs as a non-root user.
- [ ] Admin panel unreachable from the public internet (verified from outside, per `PLAN.md:160`) — this is phase 4's nginx split.

### Required before opening registration to real players
- [ ] Security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS) added to both nginx configs.
- [ ] `password_min_length` explicitly set (≥8) in Admin Settings, or hardcoded floor added to `auth.py`.
- [ ] Per-account login lockout added (mirror `reset_password()`'s counter pattern into `login()`).
- [ ] CAPTCHA (hCaptcha/Turnstile) added to `/register`, or registration gated by invite/email-domain allowlist.
- [ ] Admin-action audit logging added (4th logger + `log("admin", ...)` calls in mutating admin endpoints).
- [ ] `incorrect_submissions_per_min` / `max_attempts_timeout` deliberately reviewed and set for your actual flag format/entropy, not left at defaults.
- [ ] `MAX_CONTENT_LENGTH` set in `config.py`; `client_max_body_size` in nginx lowered to match.
- [ ] Production `docker-compose.yml` (phase 5) finished: real secrets injected via env/secrets manager, `nginx:stable` pinned to a specific version, Redis `requirepass` set.
- [ ] Load test completed with expected player count (`PLAN.md:162`).
- [ ] Database backup + restore tested (`PLAN.md:163`).
- [ ] Challenge infrastructure network-isolated from the CTFd/DB network (`PLAN.md:164`) — relevant if any pwn/web challenges run attacker-facing containers.

### Due diligence / continuous
- [ ] Dependency patch plan (Python + both theme `yarn.lock`s) executed and wired into phase 6 CI (Trivy + gitleaks + Dependabot already planned in `PLAN.md:73`).
- [ ] `CTF/.flaskenv` excluded from the production image or set to `production`.
- [ ] `PRESET_ADMIN_PASSWORD` (if used for bootstrap) compared with `hmac.compare_digest` and rotated immediately after first login.
- [ ] F-string SQL in `utils/exports/__init__.py` parameterized defensively.
- [ ] File-extension allowlist added to the admin file-upload endpoint.
- [ ] `nginx:stable` tag pinned; Redis bumped off EOL 4.x.
- [ ] `submissions.log` (contains raw flag-guess text) excluded from any public-facing backup/debug bundle.

---

*This review is static/offline analysis of the code as of 2026-11-06. It does not replace a live penetration test against the deployed staging environment once phases 4–5 are complete — recommend one pass before the real event, especially against the finished nginx admin/public split and TLS configuration.*
