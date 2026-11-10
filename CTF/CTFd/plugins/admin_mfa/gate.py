"""before_request gate: admin sessions must pass TOTP before any admin capability."""

from flask import jsonify, redirect, request, session, url_for

from CTFd.utils.logging import log
from CTFd.utils.user import authed, get_current_user, get_current_user_attrs, is_admin

from .models import AdminMfa

ALLOWED_ENDPOINTS = {"auth.logout", "views.themes", "views.themes_beta", "static"}
ALLOWED_PREFIXES = ("admin_mfa.", "plugins.")

MFA_REQUIRED = "MFA verification required"
TOKEN_BLOCKED = "Admin API tokens are disabled; use an MFA-verified session"


def _flag(row):
    # Bound to the user, CTFd's password-derived session hash, and this enrolment
    # (a reset creates a new row with a new `created`, ending old sessions).
    return {
        "uid": session.get("id"),
        "h": session.get("hash"),
        "e": row.created.isoformat() if row is not None and row.created else None,
    }


def mark_verified(row):
    session.regenerate()  # new session id: a pre-MFA session id is never upgraded
    session["admin_mfa_ok"] = _flag(row)


def is_verified(row=None):
    if row is None:
        row = AdminMfa.query.get(session.get("id"))
    if row is None or not row.enabled:
        return False
    return session.get("admin_mfa_ok") == _flag(row)


def _error(message, status):
    return jsonify({"success": False, "errors": [message]}), status


def admin_mfa_gate():
    if not authed() or not is_admin():
        return None

    if request.headers.get("Authorization"):
        log(
            "logins",
            "[{date}] {ip} - {name} blocked admin API token",
            name=get_current_user_attrs().name,
        )
        return _error(TOKEN_BLOCKED, 403)

    endpoint = request.endpoint or ""
    if endpoint in ALLOWED_ENDPOINTS or endpoint.startswith(ALLOWED_PREFIXES):
        return None
    # CTFd forces users flagged change_password to auth.reset_password; allow only
    # that page, only while the flag is set (the user already knows the password).
    if endpoint == "auth.reset_password" and get_current_user_attrs().change_password:
        return None

    # Lets CTFd log out a session whose password hash no longer matches.
    get_current_user()

    row = AdminMfa.query.get(session["id"])
    if is_verified(row):
        return None

    if request.path.startswith("/api/"):
        return _error(MFA_REQUIRED, 401)

    if row is not None and row.enabled:
        return redirect(url_for("admin_mfa.verify", next=request.full_path))
    return redirect(url_for("admin_mfa.setup"))
