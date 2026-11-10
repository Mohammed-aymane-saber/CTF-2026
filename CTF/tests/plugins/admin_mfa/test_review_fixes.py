import logging

from CTFd.models import Users, db
from CTFd.plugins.admin_mfa import totp
from CTFd.utils.security.auth import generate_user_token
from tests.helpers import login_as_user
from tests.plugins.admin_mfa.test_views import clock, code, enroll, nonce, post_verify, relogin  # noqa: F401

RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"


def test_change_password_admin_not_looped(app):
    with app.app_context():
        user = Users.query.get(1)
        user.change_password = True
        db.session.commit()
    client = login_as_user(app, "admin", raise_for_error=False)
    r = client.get("/admin/challenges")
    assert r.status_code == 302 and "/reset_password" in r.headers["Location"]
    r = client.get(r.headers["Location"])
    assert r.status_code == 200, r.headers.get("Location")


class _ListHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


def test_blocked_admin_token_is_logged(app):
    # CTFd sets propagate=0 on the "logins" logger, so attach a handler directly.
    handler = _ListHandler()
    logging.getLogger("logins").addHandler(handler)
    try:
        with app.app_context():
            token = generate_user_token(Users.query.get(1)).value
        with app.test_client() as client:
            client.get("/api/v1/users", headers={"Authorization": f"Token {token}"}, json=True)
    finally:
        logging.getLogger("logins").removeHandler(handler)
    assert any("blocked admin API token" in m for m in handler.messages)


def test_non_ascii_digits_rejected():
    for bad in ("１２３４５６", "١٢٣٤٥٦"):
        assert totp.verify(RFC_SECRET, bad, now=1111111109) is None


def test_session_id_regenerated_on_verify(app, clock):  # noqa: F811
    enroll(app, clock)
    client = relogin(app)
    before = client.get_cookie("session").value
    clock["now"] += 30
    post_verify(client, code=code(app, clock["now"]))
    assert client.get_cookie("session").value != before
    assert client.get("/admin/challenges").status_code == 200


def test_reset_ends_verified_sessions(app, clock):  # noqa: F811
    client, _ = enroll(app, clock)
    assert client.get("/admin/challenges").status_code == 200
    app.test_cli_runner().invoke(args=["admin-mfa-reset", "admin@examplectf.com"])
    r = client.get("/admin/challenges")
    assert r.status_code == 302 and r.headers["Location"].endswith("/admin-mfa/setup")
