from CTFd.cache import clear_user_session
from CTFd.models import Users, db
from CTFd.utils.security.auth import generate_user_token
from tests.helpers import login_as_user, register_user
from tests.plugins.admin_mfa.helpers import mark_session_verified

MFA_REQUIRED = {"success": False, "errors": ["MFA verification required"]}
TOKEN_BLOCKED = {
    "success": False,
    "errors": ["Admin API tokens are disabled; use an MFA-verified session"],
}


def test_unenrolled_admin_redirected_to_setup(app):
    client = login_as_user(app, "admin")
    r = client.get("/admin/challenges")
    assert r.status_code == 302
    assert r.headers["Location"].endswith("/admin-mfa/setup")


def test_api_requires_mfa(app):
    client = login_as_user(app, "admin")
    r = client.get("/api/v1/challenges")
    assert r.status_code == 401
    assert r.get_json() == MFA_REQUIRED


def test_admin_token_blocked(app):
    with app.app_context():
        token = generate_user_token(Users.query.get(1)).value
    for prefix in ("Token", "Bearer"):
        with app.test_client() as client:
            r = client.get(
                "/api/v1/users",
                headers={"Authorization": f"{prefix} {token}", "Content-Type": "application/json"},
            )
            assert r.status_code == 403, prefix
            assert r.get_json() == TOKEN_BLOCKED


def test_player_token_ok(app):
    register_user(app)
    with app.app_context():
        token = generate_user_token(Users.query.get(2)).value
    with app.test_client() as client:
        r = client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Token {token}", "Content-Type": "application/json"},
        )
        assert r.status_code == 200


def test_player_unaffected(app):
    register_user(app)
    client = login_as_user(app)
    for path in ("/challenges", "/api/v1/challenges", "/admin"):
        r = client.get(path)
        assert "/admin-mfa" not in r.headers.get("Location", ""), path
        assert r.status_code != 401, path


def test_static_allowed(app):
    client = login_as_user(app, "admin")
    r = client.get("/themes/core/static/assets/main.e9ec7884.css")
    assert r.status_code == 200


def test_verified_session_passes(app):
    client = login_as_user(app, "admin")
    mark_session_verified(client, app)
    assert client.get("/admin/challenges").status_code == 200
    assert client.get("/api/v1/challenges").status_code == 200


def test_password_change_ends_session(app):
    client = login_as_user(app, "admin")
    mark_session_verified(client, app)
    with app.app_context():
        user = Users.query.get(1)
        user.password = "a-brand-new-password"
        db.session.commit()
        clear_user_session(user_id=1)
    r = client.get("/admin/challenges")
    assert r.status_code == 302
    assert "/login" in r.headers["Location"]


def test_promoted_user_gated(app):
    register_user(app)
    client = login_as_user(app)
    with app.app_context():
        user = Users.query.get(2)
        user.type = "admin"
        db.session.commit()
        clear_user_session(user_id=2)
    r = client.get("/admin")
    assert r.status_code == 302
    assert r.headers["Location"].endswith("/admin-mfa/setup")
