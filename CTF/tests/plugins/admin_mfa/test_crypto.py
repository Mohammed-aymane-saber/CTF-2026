import re

import pytest
from cryptography.fernet import Fernet

from CTFd.plugins.admin_mfa import crypto


class StubApp:
    def __init__(self, secret_key):
        self.config = {"SECRET_KEY": secret_key}
        self.extensions = {}


def test_derived_key_is_deterministic(monkeypatch):
    monkeypatch.delenv("ADMIN_MFA_ENCRYPTION_KEY", raising=False)
    token = crypto.encrypt_secret(StubApp("k1"), "SECRET")
    assert crypto.decrypt_secret(StubApp("k1"), token) == "SECRET"
    assert crypto.decrypt_secret(StubApp("k2"), token) is None


def test_explicit_env_key_used(monkeypatch):
    monkeypatch.delenv("ADMIN_MFA_ENCRYPTION_KEY", raising=False)
    derived_token = crypto.encrypt_secret(StubApp("k1"), "SECRET")
    monkeypatch.setenv("ADMIN_MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    app = StubApp("k1")
    assert crypto.decrypt_secret(app, crypto.encrypt_secret(app, "SECRET")) == "SECRET"
    assert crypto.decrypt_secret(app, derived_token) is None


def test_malformed_env_key_raises(monkeypatch):
    monkeypatch.setenv("ADMIN_MFA_ENCRYPTION_KEY", "short")
    with pytest.raises(RuntimeError):
        crypto.get_fernet(StubApp("k1"))


def test_decrypt_garbage_returns_none(monkeypatch):
    monkeypatch.delenv("ADMIN_MFA_ENCRYPTION_KEY", raising=False)
    assert crypto.decrypt_secret(StubApp("k1"), "not-a-token") is None


def test_recovery_codes_format():
    codes = crypto.generate_recovery_codes()
    assert len(codes) == 10 and len(set(codes)) == 10
    assert all(re.fullmatch(r"[A-Z2-7]{5}-[A-Z2-7]{5}", c) for c in codes)


def test_recovery_hash_salted_and_matches_normalized():
    h1, h2 = crypto.hash_recovery_code("ABCDE-FGHIJ"), crypto.hash_recovery_code("ABCDE-FGHIJ")
    assert h1 != h2
    assert re.fullmatch(r"[0-9a-f]{32}\$[0-9a-f]{64}", h1)
    hashes = [crypto.hash_recovery_code("ZZZZZ-ZZZZZ"), h1]
    assert crypto.match_recovery_code(" abcde fghij ", hashes) == 1
    assert crypto.match_recovery_code("ABCDE-FGHIK", hashes) is None
    assert crypto.match_recovery_code("", hashes) is None
