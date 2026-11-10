import base64
import re

from CTFd.plugins.admin_mfa import totp

RFC_SECRET = base64.b32encode(b"12345678901234567890").decode().rstrip("=")


def test_rfc6238_vectors():
    vectors = {
        59: "287082",
        1111111109: "081804",
        1111111111: "050471",
        1234567890: "005924",
        2000000000: "279037",
    }
    for unix, expected in vectors.items():
        assert totp.code_at(RFC_SECRET, unix // 30) == expected


def test_window():
    now = 1111111109
    t = now // 30
    for offset in (-1, 0, 1):
        assert totp.verify(RFC_SECRET, totp.code_at(RFC_SECRET, t + offset), now=now) == t + offset
    for offset in (-2, 2):
        assert totp.verify(RFC_SECRET, totp.code_at(RFC_SECRET, t + offset), now=now) is None


def test_normalization():
    now = 1111111109
    assert totp.verify(RFC_SECRET, "081 804", now=now) == now // 30
    for bad in ("08180a", "0818045", "", None):
        assert totp.verify(RFC_SECRET, bad, now=now) is None


def test_uri():
    uri = totp.provisioning_uri(RFC_SECRET, "admin@x.io")
    assert uri.startswith("otpauth://totp/Eclipse%20CTF:admin%40x.io?")
    for part in ("secret=" + RFC_SECRET, "issuer=Eclipse%20CTF", "digits=6", "period=30"):
        assert part in uri


def test_generate_secret():
    a, b = totp.generate_secret(), totp.generate_secret()
    assert len(a) == 32 and re.fullmatch(r"[A-Z2-7]{32}", a)
    assert a != b
