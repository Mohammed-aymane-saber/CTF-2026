"""Enrolment (/admin-mfa/setup) and verification (/admin-mfa/verify) pages."""

import json
import time

from flask import Blueprint, abort, current_app, redirect, render_template, request, session, url_for
from sqlalchemy import or_, update

from CTFd.models import db
from CTFd.utils.decorators import ratelimit
from CTFd.utils.logging import log
from CTFd.utils.security.csrf import generate_nonce
from CTFd.utils.user import authed, get_current_user, is_admin
from CTFd.utils.validators import is_safe_url

from . import crypto, totp
from .gate import is_verified, mark_verified
from .models import AdminMfa
from .qr import svg

admin_mfa = Blueprint("admin_mfa", __name__)

TPL = "plugins/admin_mfa/templates/{}.html"
INVALID = "Invalid code"
_CODES_KEY = "_admin_mfa_codes"
_table = AdminMfa.__table__


def consume_counter(user_id, counter):
    """Atomically advance last_counter; False if this step (or a later one) was already used."""
    result = db.session.execute(
        update(_table)
        .where(
            _table.c.user_id == user_id,
            or_(_table.c.last_counter.is_(None), _table.c.last_counter < counter),
        )
        .values(last_counter=counter)
    )
    db.session.commit()
    return result.rowcount == 1


def consume_recovery(user_id, code):
    """Atomically remove a matching recovery code; False if none matched."""
    for _ in range(2):
        db.session.expire_all()
        row = AdminMfa.query.get(user_id)
        if row is None:
            return False
        hashes = row.get_recovery()
        idx = crypto.match_recovery_code(code, hashes)
        if idx is None:
            return False
        remaining = hashes[:idx] + hashes[idx + 1 :]
        result = db.session.execute(
            update(_table)
            .where(_table.c.user_id == user_id, _table.c.recovery_hashes == row.recovery_hashes)
            .values(recovery_hashes=json.dumps(remaining))
        )
        db.session.commit()
        if result.rowcount == 1:
            return True
    return False


def _current_admin():
    if not authed():
        abort(redirect(url_for("auth.login", next=request.full_path)))
    if not is_admin():
        abort(403)
    return get_current_user()


def _safe_next():
    target = request.args.get("next")
    if target and is_safe_url(target):
        return target
    return url_for("admin.view")


def _finish_login(user):
    mark_verified()
    session["nonce"] = generate_nonce()


@admin_mfa.route("/setup", methods=["GET", "POST"])
def setup():
    user = _current_admin()
    row = AdminMfa.query.get(user.id)
    if row is not None and row.enabled:
        return redirect(url_for("admin_mfa.verify"))

    secret = crypto.decrypt_secret(current_app, row.secret_enc) if row else None
    if secret is None:
        secret = totp.generate_secret()
        if row is None:
            row = AdminMfa(user_id=user.id, secret_enc="", enabled=False)
            db.session.add(row)
        row.secret_enc = crypto.encrypt_secret(current_app, secret)
        row.set_recovery([])
        db.session.commit()

    error = None
    if request.method == "POST":
        counter = totp.verify(secret, request.form.get("code"), now=time.time())
        if counter is not None and consume_counter(user.id, counter):
            codes = crypto.generate_recovery_codes()
            row = AdminMfa.query.get(user.id)
            row.set_recovery([crypto.hash_recovery_code(c) for c in codes])
            row.enabled = True
            db.session.commit()
            _finish_login(user)
            session[_CODES_KEY] = codes
            log("logins", "[{date}] {ip} - {name} enrolled admin MFA", name=user.name)
            return redirect(url_for("admin_mfa.setup_done"))
        error = INVALID
        log("logins", "[{date}] {ip} - {name} failed admin MFA enrolment", name=user.name)

    uri = totp.provisioning_uri(secret, user.email or user.name)
    return render_template(TPL.format("setup"), qr=svg(uri), secret=secret, error=error)


@admin_mfa.route("/setup/done", methods=["GET"])
def setup_done():
    _current_admin()
    codes = session.pop(_CODES_KEY, None)
    if not codes or not is_verified():
        return redirect(url_for("admin.view"))
    return render_template(TPL.format("recovery_codes"), codes=codes)


@admin_mfa.route("/verify", methods=["GET", "POST"])
@ratelimit(method="POST", limit=10, interval=300)
def verify():
    user = _current_admin()
    row = AdminMfa.query.get(user.id)
    if row is None or not row.enabled:
        return redirect(url_for("admin_mfa.setup"))
    if is_verified():
        return redirect(_safe_next())

    error = None
    if request.method == "POST":
        ok = False
        recovery = request.form.get("recovery", "").strip()
        if recovery:
            ok = consume_recovery(user.id, recovery)
            if ok:
                left = len(AdminMfa.query.get(user.id).get_recovery())
                log(
                    "logins",
                    "[{date}] {ip} - {name} used an admin MFA recovery code ({left} left)",
                    name=user.name,
                    left=left,
                )
        else:
            secret = crypto.decrypt_secret(current_app, row.secret_enc)
            if secret is None:
                log(
                    "logins",
                    "[{date}] {ip} - {name} admin MFA secret unreadable "
                    "(encryption key changed?); run flask admin-mfa-reset",
                    name=user.name,
                )
            else:
                counter = totp.verify(secret, request.form.get("code"), now=time.time())
                ok = counter is not None and consume_counter(user.id, counter)
        if ok:
            _finish_login(user)
            log("logins", "[{date}] {ip} - {name} passed admin MFA", name=user.name)
            return redirect(_safe_next())
        error = INVALID
        log("logins", "[{date}] {ip} - {name} failed admin MFA", name=user.name)

    return render_template(TPL.format("verify"), error=error)
