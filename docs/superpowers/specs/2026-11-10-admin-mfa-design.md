# Admin MFA (TOTP) for CTFd: design

Date: 2026-11-10
Status: draft, awaiting review
Reference: Tetu-Tech `backend/src/services/mfaService.js` (TOTP + encrypted secret + hashed recovery codes + replay counter)

## 1. Goal

Every CTFd **admin** account must present a second factor, a 6-digit TOTP code from an authenticator app (Google Authenticator, Aegis, etc.), before it can use any admin capability, whether through `/admin` pages or `/api/v1`. Players are not affected.

Success criteria:

- An admin who has only entered a password cannot read or change anything admin-only.
- An admin without MFA is forced to enrol at first login (QR code + manual key).
- A leaked admin API token cannot be used to bypass MFA.
- A lost phone can be recovered with a one-time recovery code, or reset from the server CLI.
- CTFd core files are not changed; everything lives in one first-party plugin.

Out of scope: MFA for players, WebAuthn/passkeys, email OTP, an admin UI for managing other admins' MFA.

## 2. Decisions

| Topic | Decision |
|---|---|
| Location | First-party plugin `CTF/CTFd/plugins/admin_mfa/` (no core CTFd edits) |
| Who | All users with `type == "admin"`; enrolment is mandatory |
| Admin API tokens | **Blocked** (403) for admin accounts. Player tokens unchanged |
| Encryption key | `ADMIN_MFA_ENCRYPTION_KEY` env var (Fernet key). If unset, derived from `SECRET_KEY` via HKDF-SHA256 and a warning is logged |
| TOTP | RFC 6238, SHA1, 6 digits, 30 s period, ±1 step window, implemented with stdlib `hmac` |
| QR code | `qrcode` library, server-side **inline SVG** (no `data:` URI, no CDN; CSP unchanged) |
| Recovery | 10 single-use codes, shown once, stored as salted SHA-256 hashes |
| Reset | `flask admin-mfa-reset <email>` CLI command |

## 3. Components

```
CTF/CTFd/plugins/admin_mfa/
├── __init__.py        load(app): migrations, blueprint, before_request gate, CLI command
├── models.py          AdminMfa model
├── crypto.py          key derivation, encrypt/decrypt secret, recovery code hashing
├── totp.py            generate secret, otpauth URI, verify code -> counter
├── gate.py            the before_request function and its allowlist
├── views.py           /admin-mfa/setup, /admin-mfa/verify blueprint
├── qr.py              otpauth URI -> inline SVG string
├── templates/admin_mfa/{setup,verify,recovery_codes}.html
├── migrations/  (one Alembic revision creating admin_mfa)
└── requirements.txt   qrcode pinned to an exact version
```

Each module has one job and can be tested by itself: `totp.py` and `crypto.py` are pure functions, `gate.py` only decides allow/deny/redirect, and `views.py` only handles HTTP.

### 3.1 Data model (`admin_mfa` table)

| Column | Type | Notes |
|---|---|---|
| `user_id` | Integer, PK, `ForeignKey('users.id', ondelete='CASCADE')` | One row per admin |
| `secret_enc` | Text | Fernet token of the base32 secret |
| `enabled` | Boolean, default False | True only after the first code is confirmed |
| `last_counter` | BigInteger, nullable | Last accepted TOTP time-step |
| `recovery_hashes` | Text (JSON list) | Remaining salted hashes; a used code is removed |
| `created` | DateTime | |

A proper Alembic migration ships in `migrations/` and runs via `CTFd.plugins.migrations.upgrade()`. On SQLite, CTFd falls back to `create_all()`.

### 3.2 Crypto (`crypto.py`)

- Key: if `ADMIN_MFA_ENCRYPTION_KEY` is set, it is used as a Fernet key (startup fails clearly if it is malformed). Otherwise `HKDF(SHA256, length=32, salt=b"ctfd-admin-mfa-v1", info=b"ctfd-admin-mfa-encryption")` is applied to `SECRET_KEY`, the result is urlsafe-base64 encoded as the Fernet key, and one warning is logged. `SECRET_KEY` is never sliced or plain-hashed.
- Recovery codes: format `XXXXX-XXXXX` (from `secrets`, base32 alphabet). Stored as `sha256(salt + normalized_code)`, where salt is a per-code 16-byte random value, encoded as `salt_hex$hash_hex`. Verification normalizes the input (uppercase, strip spaces and dashes), recomputes the hash for each stored entry, and compares with `hmac.compare_digest`.

### 3.3 TOTP (`totp.py`)

- `generate_secret()`: 20 random bytes, base32.
- `provisioning_uri(secret, account, issuer="Eclipse CTF")`: `otpauth://totp/...`.
- `verify(secret, code, now) -> counter | None`: accepts only `^\d{6}$` after stripping spaces. Checks T-1, T and T+1 (`T = floor(unix/30)`) and compares with `hmac.compare_digest`. Returns the matching counter or None. Codes outside the window are rejected.
- Tested against the RFC 6238 Appendix B SHA1 vectors (truncated to 6 digits).

### 3.4 Replay protection

When a code is accepted at counter `c`, the plugin runs an atomic conditional update in the request's transaction:

```sql
UPDATE admin_mfa SET last_counter = :c
WHERE user_id = :uid AND (last_counter IS NULL OR last_counter < :c)
```

The code is accepted only if `rowcount == 1`. Two concurrent requests with the same code cannot both succeed, and a code at or below the last accepted step is rejected.

Recovery code consumption uses the same pattern: an update conditioned on the previous `recovery_hashes` value, which retries once if the row changed in between.

## 4. Request gate (`gate.py`)

Registered with `app.before_request` inside `load(app)`. Plugins load after CTFd's own request processors, so it runs after CTFd's `tokens()` and `csrf()` hooks.

Decision order:

1. Not authenticated, or not `is_admin()` → **allow** (players and anonymous users are untouched).
2. `Authorization` header present (CTFd token auth logs the token's user into the session via `login_user`) → **403** JSON `{"success": false, "errors": ["Admin API tokens are disabled; use an MFA-verified session"]}`.
3. Endpoint is on the allowlist → **allow**:
   - `admin_mfa.*` (setup, verify)
   - `auth.logout`
   - `views.static_html` is **not** allowlisted. Only static files are: `views.themes`, `views.themes_beta`, `static`, and plugin asset endpoints.
4. Session is MFA-verified → **allow**. Verified means `session["admin_mfa_ok"] == {"uid": session["id"], "h": session["hash"]}`.
   - `session["hash"]` is CTFd's existing `hmac(user.password)` (keyed with `SECRET_KEY`), so the plugin stores nothing password-derived of its own in the cookie. Flask cookies are signed but not encrypted.
   - CTFd's `get_current_user()` already logs out a session whose hash no longer matches. The gate calls it before checking, so a password change ends every MFA-verified session right away.
5. Otherwise:
   - `/api/` paths → **401** JSON `{"success": false, "errors": ["MFA verification required"]}`.
   - Everything else → redirect to `/admin-mfa/setup` (no enabled row) or `/admin-mfa/verify?next=<safe path>`. `next` is validated with CTFd's existing `is_safe_url` helper.

Logout uses CTFd's `session.clear()`, which drops the flag, so every new login needs a fresh code.

## 5. Pages (`views.py`)

All forms are POST with CTFd's `nonce` CSRF field and use plain Jinja templates extending the core theme's `base.html`. No inline scripts are added.

- **GET/POST `/admin-mfa/setup`**: only for admins who are not enrolled (enrolled admins are redirected to verify).
  - GET creates or reuses a pending secret (row with `enabled=False`) and shows the inline-SVG QR code plus the manual key.
  - POST takes a code. If it is valid, the plugin sets `enabled=True` and `last_counter`, generates the recovery codes, marks the session verified, and renders the recovery codes page once. The page has a "continue to admin" link.
- **GET/POST `/admin-mfa/verify`**: a code field, plus a "use a recovery code" field.
  - On success it marks the session verified, rotates CTFd's `session["nonce"]`, and redirects to the safe `next` or `/admin`.
  - Rate-limited with CTFd's `ratelimit` decorator: 10 POSTs per 5 minutes per IP.
- **Logging** (`CTFd.utils.logging.log`, logger `logins`): enrolment, success, failure, recovery-code use (with remaining count), blocked admin token.

## 6. CLI

`flask admin-mfa-reset <email>`, registered with `app.cli.add_command` in `load(app)`. It looks up the admin by email, deletes the `admin_mfa` row, commits, and prints a confirmation. If the email is unknown or not an admin, it exits with a non-zero code. The admin then re-enrols at the next login.

In Docker: `docker compose exec ctfd flask admin-mfa-reset admin@example.com`.

## 7. Error handling

- Malformed `ADMIN_MFA_ENCRYPTION_KEY`: raise at `load()`, so the app fails fast at startup.
- Secret that cannot be decrypted (key changed): verify shows a generic error, and the log says to run the reset CLI. It never falls back to accepting the code.
- Wrong or expired code: a generic "Invalid code" message that never says which part failed.

## 8. Testing (`CTF/tests/plugins/test_admin_mfa.py`, using CTFd's `create_ctfd` helpers)

1. TOTP matches the RFC 6238 SHA1 test vectors. Codes at ±1 step are accepted, ±2 steps rejected, non-numeric input rejected.
2. HKDF fallback is deterministic for one `SECRET_KEY` and differs for another. An explicit env key is used when set.
3. An unenrolled admin is redirected from `/admin/challenges` to `/admin-mfa/setup`.
4. Full enrolment: setup → valid code → recovery codes shown → `/admin/challenges` returns 200.
5. An enrolled admin with a fresh login is redirected to verify. A wrong code is rejected and the right one accepted.
6. Replay: the same code is rejected on a second verify (new session).
7. A recovery code works once and is rejected the second time.
8. `/api/v1/challenges` as an unverified admin returns 401 JSON.
9. An admin API token gets 403. A player API token still works.
10. Static/theme asset URLs load for an unverified admin.
11. Changing the admin's password logs out the MFA-verified session immediately.
12. Players: login, `/challenges` and the API are unchanged.
13. `flask admin-mfa-reset` removes enrolment and fails for an unknown email.

The full existing CTFd test suite must still pass. The CI already runs it, along with Bandit, Trivy and ZAP.

## 9. Deployment notes

- Set `ADMIN_MFA_ENCRYPTION_KEY` in production (generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) and keep it with the other production secrets. Changing it makes existing enrolments unreadable, and those admins must be reset.
- Server time must be NTP-synced. The ±30 s window tolerates small drift only.
- The admin nginx (`admin.conf`, private access) needs no change. The public nginx whitelist must **not** expose `/admin-mfa/*`.
