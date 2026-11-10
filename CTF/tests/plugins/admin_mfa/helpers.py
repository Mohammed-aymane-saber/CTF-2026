from CTFd.models import db
from CTFd.plugins.admin_mfa.models import AdminMfa


def mark_session_verified(client, app, uid=1):
    """Give `uid` an enabled enrolment and mark the client's session as MFA-verified."""
    with app.app_context():
        row = AdminMfa.query.get(uid)
        if row is None:
            row = AdminMfa(user_id=uid, secret_enc="x", enabled=True, recovery_hashes="[]")
            db.session.add(row)
            db.session.commit()
        epoch = row.created.isoformat()
    with client.session_transaction() as sess:
        sess["admin_mfa_ok"] = {"uid": sess["id"], "h": sess.get("hash"), "e": epoch}
