import re
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet

from CTFd.plugins.admin_mfa import crypto, totp, views
from CTFd.plugins.admin_mfa.models import AdminMfa
from tests.helpers import login_as_user

T0 = 1_800_000_000  # fixed clock, aligned to a 30 s step
CODE_RE = re.compile(r"\b[A-Z2-7]{5}-[A-Z2-7]{5}\b")


@pytest.fixture
def clock(monkeypatch):
    state = {"now": T0}
    monkeypatch.setattr(views, "time", SimpleNamespace(time=lambda: state["now"]))
    return state


def nonce(client):
    with client.session_transaction() as sess:
        return sess["nonce"]


def secret_for(app, uid=1):
    with app.app_context():
        return crypto.decrypt_secret(app, AdminMfa.query.get(uid).secret_enc)


def code(app, now, uid=1):
    return totp.code_at(secret_for(app, uid), int(now // 30))


def enroll(app, clock):
    """Enrol the admin; return (client, recovery codes)."""
    client = login_as_user(app, "admin")
    client.get("/admin-mfa/setup")
    r = client.post("/admin-mfa/setup", data={"code": code(app, clock["now"]), "nonce": nonce(client)})
    assert r.status_code == 302 and r.headers["Location"].endswith("/admin-mfa/setup/done")
    page = client.get("/admin-mfa/setup/done").get_data(as_text=True)
    return client, CODE_RE.findall(page)


def relogin(app):
    client = login_as_user(app, "admin")
    r = client.get("/admin/challenges")
    assert "/admin-mfa/verify" in r.headers["Location"]
    return client


def post_verify(client, path="/admin-mfa/verify", **data):
    data["nonce"] = nonce(client)
    return client.post(path, data=data)


def test_setup_get_shows_qr_and_stable_secret(app, clock):
    client = login_as_user(app, "admin")
    first = client.get("/admin-mfa/setup").get_data(as_text=True)
    second = client.get("/admin-mfa/setup").get_data(as_text=True)
    secret = secret_for(app)
    assert "<svg" in first and secret in first and secret in second
    with app.app_context():
        assert AdminMfa.query.get(1).enabled is False


def test_setup_full_flow(app, clock):
    client, codes = enroll(app, clock)
    assert len(codes) == 10
    again = client.get("/admin-mfa/setup/done")
    assert again.status_code == 302 and again.headers["Location"].endswith("/admin")
    assert client.get("/admin/challenges").status_code == 200
    with app.app_context():
        assert AdminMfa.query.get(1).enabled is True


def test_setup_wrong_code(app, clock):
    client = login_as_user(app, "admin")
    client.get("/admin-mfa/setup")
    r = client.post("/admin-mfa/setup", data={"code": "000000", "nonce": nonce(client)})
    assert r.status_code == 200 and "Invalid code" in r.get_data(as_text=True)
    with app.app_context():
        assert AdminMfa.query.get(1).enabled is False


def test_verify_after_relogin(app, clock):
    enroll(app, clock)
    client = relogin(app)
    r = post_verify(client, code="000000")
    assert r.status_code == 200 and "Invalid code" in r.get_data(as_text=True)
    verify_url = client.get("/admin/challenges").headers["Location"]
    clock["now"] += 30
    r = post_verify(client, path=verify_url, code=code(app, clock["now"]))
    assert r.status_code == 302 and r.headers["Location"].rstrip("?").endswith("/admin/challenges")
    assert client.get("/admin/challenges").status_code == 200


def test_replay_rejected(app, clock):
    enroll(app, clock)
    client = relogin(app)
    r = post_verify(client, code=code(app, clock["now"]))  # same step as enrolment
    assert "Invalid code" in r.get_data(as_text=True)
    assert client.get("/admin/challenges").status_code == 302


def test_recovery_code_once(app, clock):
    _, codes = enroll(app, clock)
    client = relogin(app)
    assert post_verify(client, recovery=codes[0].lower()).status_code == 302
    client = relogin(app)
    r = post_verify(client, recovery=codes[0])
    assert "Invalid code" in r.get_data(as_text=True)
    with app.app_context():
        assert len(AdminMfa.query.get(1).get_recovery()) == 9


@pytest.mark.parametrize(
    "target,expected",
    [("//evil.com", "/admin"), ("https://evil.com", "/admin"), ("/admin/users", "/admin/users")],
)
def test_next_is_safe(app, clock, target, expected):
    enroll(app, clock)
    client = login_as_user(app, "admin")
    clock["now"] += 30
    r = post_verify(client, path=f"/admin-mfa/verify?next={target}", code=code(app, clock["now"]))
    assert r.status_code == 302
    assert r.headers["Location"] in (expected, "http://localhost" + expected)


def test_pending_row_not_verifiable(app, clock):
    client = login_as_user(app, "admin")
    client.get("/admin-mfa/setup")
    r = client.get("/admin-mfa/verify")
    assert r.status_code == 302 and r.headers["Location"].endswith("/admin-mfa/setup")


def test_bad_key_generic_error(app, clock):
    enroll(app, clock)
    client = relogin(app)
    clock["now"] += 30
    good = code(app, clock["now"])
    app.extensions["admin_mfa_fernet"] = Fernet(Fernet.generate_key())
    r = post_verify(client, code=good)
    assert r.status_code == 200 and "Invalid code" in r.get_data(as_text=True)
    assert client.get("/admin/challenges").status_code == 302


def test_enrolled_admin_cannot_resetup(app, clock):
    enroll(app, clock)
    client = relogin(app)
    r = client.get("/admin-mfa/setup")
    assert r.status_code == 302 and "/admin-mfa/verify" in r.headers["Location"]


def test_nonce_rotated(app, clock):
    enroll(app, clock)
    client = relogin(app)
    before = nonce(client)
    clock["now"] += 30
    post_verify(client, code=code(app, clock["now"]))
    assert nonce(client) != before


def test_non_admin_cannot_use_pages(app, clock):
    from tests.helpers import register_user

    register_user(app)
    client = login_as_user(app)
    assert client.get("/admin-mfa/setup").status_code == 403
    assert client.get("/admin-mfa/verify").status_code == 403
