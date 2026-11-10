from CTFd.models import db
from CTFd.plugins.admin_mfa.models import AdminMfa
from tests.helpers import register_user


def _enrol(app):
    with app.app_context():
        db.session.add(AdminMfa(user_id=1, secret_enc="x", enabled=True, recovery_hashes="[]"))
        db.session.commit()


def test_reset_enrolled_admin(app):
    _enrol(app)
    r = app.test_cli_runner().invoke(args=["admin-mfa-reset", "admin@examplectf.com"])
    assert r.exit_code == 0, r.output
    assert "MFA reset for admin@examplectf.com" in r.output
    with app.app_context():
        assert AdminMfa.query.get(1) is None


def test_reset_unknown_email(app):
    r = app.test_cli_runner().invoke(args=["admin-mfa-reset", "nobody@example.com"])
    assert r.exit_code == 1
    assert "No admin with that email" in r.output


def test_reset_player_email(app):
    register_user(app)
    r = app.test_cli_runner().invoke(args=["admin-mfa-reset", "user@examplectf.com"])
    assert r.exit_code == 1
