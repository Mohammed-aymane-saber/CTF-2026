"""RFC 6238 TOTP (SHA1, 6 digits, 30 s) using only the standard library."""

import base64
import hashlib
import hmac
import re
import secrets
import time
from urllib.parse import quote

DIGITS = 6
PERIOD = 30
WINDOW = 1
ISSUER = "Eclipse CTF"

_CODE_RE = re.compile(r"[0-9]{6}")


def generate_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _key(secret):
    s = secret.strip().upper()
    return base64.b32decode(s + "=" * (-len(s) % 8))


def code_at(secret, counter):
    digest = hmac.new(_key(secret), counter.to_bytes(8, "big"), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = int.from_bytes(digest[offset : offset + 4], "big") & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def verify(secret, code, now=None):
    """Return the matching time-step counter, or None."""
    if not isinstance(code, str):
        return None
    code = re.sub(r"\s+", "", code)
    if not _CODE_RE.fullmatch(code):
        return None
    t = int((time.time() if now is None else now) // PERIOD)
    for counter in range(t - WINDOW, t + WINDOW + 1):
        if hmac.compare_digest(code_at(secret, counter), code):
            return counter
    return None


def provisioning_uri(secret, account, issuer=ISSUER):
    label = quote(issuer, safe="") + ":" + quote(account, safe="")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer, safe='')}"
        f"&algorithm=SHA1&digits={DIGITS}&period={PERIOD}"
    )
