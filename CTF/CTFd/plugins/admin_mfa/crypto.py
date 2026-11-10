"""Encryption of TOTP secrets and hashing of recovery codes."""

import base64
import hashlib
import hmac
import logging
import os
import secrets

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

ENV_KEY = "ADMIN_MFA_ENCRYPTION_KEY"
HKDF_SALT = b"ctfd-admin-mfa-v1"
HKDF_INFO = b"ctfd-admin-mfa-encryption"
_EXT = "admin_mfa_fernet"
_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

log = logging.getLogger(__name__)


def _derive_key(secret_key):
    if isinstance(secret_key, str):
        secret_key = secret_key.encode("utf-8")
    raw = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=HKDF_SALT, info=HKDF_INFO
    ).derive(secret_key)
    return base64.urlsafe_b64encode(raw)


def get_fernet(app):
    fernet = app.extensions.get(_EXT)
    if fernet is not None:
        return fernet
    env_key = os.environ.get(ENV_KEY)
    if env_key:
        try:
            fernet = Fernet(env_key.encode("ascii"))
        except (ValueError, UnicodeEncodeError) as e:
            raise RuntimeError(
                f"{ENV_KEY} is not a valid Fernet key "
                "(generate one with cryptography.fernet.Fernet.generate_key())"
            ) from e
    else:
        log.warning(
            "%s is not set; deriving the admin MFA encryption key from SECRET_KEY",
            ENV_KEY,
        )
        fernet = Fernet(_derive_key(app.config["SECRET_KEY"]))
    app.extensions[_EXT] = fernet
    return fernet


def encrypt_secret(app, secret):
    return get_fernet(app).encrypt(secret.encode("ascii")).decode("ascii")


def decrypt_secret(app, token):
    try:
        return get_fernet(app).decrypt(token.encode("ascii")).decode("ascii")
    except (InvalidToken, ValueError, UnicodeError, AttributeError):
        return None


def generate_recovery_codes(n=10):
    def part():
        return "".join(secrets.choice(_ALPHABET) for _ in range(5))

    codes = set()
    while len(codes) < n:
        codes.add(f"{part()}-{part()}")
    return sorted(codes)


def _normalize(code):
    return "".join(ch for ch in str(code or "").upper() if ch.isalnum())


def _digest(salt, code):
    return hashlib.sha256(salt + _normalize(code).encode("ascii")).hexdigest()


def hash_recovery_code(code):
    salt = secrets.token_bytes(16)
    return f"{salt.hex()}${_digest(salt, code)}"


def match_recovery_code(code, hashes_list):
    """Return the index of the stored hash matching `code`, or None."""
    if not _normalize(code):
        return None
    found = None
    for i, stored in enumerate(hashes_list):
        try:
            salt_hex, digest = stored.split("$", 1)
            candidate = _digest(bytes.fromhex(salt_hex), code)
        except (ValueError, UnicodeEncodeError):
            continue
        if hmac.compare_digest(candidate, digest) and found is None:
            found = i
    return found
