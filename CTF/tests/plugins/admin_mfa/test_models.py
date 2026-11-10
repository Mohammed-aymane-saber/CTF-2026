from sqlalchemy import inspect

from CTFd.models import db
from CTFd.plugins.admin_mfa import qr
from CTFd.plugins.admin_mfa.models import AdminMfa


def test_table_created(app):
    with app.app_context():
        assert inspect(db.engine).has_table("admin_mfa")


def test_user_fk_cascades(app):
    with app.app_context():
        fks = AdminMfa.__table__.c.user_id.foreign_keys
        assert len(fks) == 1
        fk = next(iter(fks))
        assert fk.target_fullname == "users.id"
        assert fk.ondelete == "CASCADE"


def test_recovery_roundtrip(app):
    with app.app_context():
        row = AdminMfa(user_id=1, secret_enc="x")
        row.set_recovery(["a$b", "c$d"])
        db.session.add(row)
        db.session.commit()
        assert AdminMfa.query.get(1).get_recovery() == ["a$b", "c$d"]
        assert AdminMfa.query.get(1).enabled is False


def test_qr_inline_svg():
    svg = str(qr.svg("otpauth://totp/Eclipse%20CTF:a?secret=ABC"))
    assert svg.startswith("<svg")
    assert "data:" not in svg
