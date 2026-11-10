"""before_request gate: admin sessions must pass TOTP before any admin capability."""

from flask import jsonify, redirect, request, session, url_for

from CTFd.utils.user import authed, get_current_user, is_admin

from .models import AdminMfa

ALLOWED_ENDPOINTS = {"auth.logout", "views.themes", "views.themes_beta", "static"}
ALLOWED_PREFIXES = ("admin_mfa.", "plugins.")

MFA_REQUIRED = "MFA verification required"
TOKEN_BLOCKED = "Admin API tokens are disabled; use an MFA-verified session"


def _flag():
    return {"uid": session.get("id"), "h": session.get("hash")}


def mark_verified():
    session["admin_mfa_ok"] = _flag()


def is_verified():
    return session.get("admin_mfa_ok") == _flag()


def _error(message, status):
    return jsonify({"success": False, "errors": [message]}), status


def admin_mfa_gate():
    if not authed() or not is_admin():
        return None

    if request.headers.get("Authorization"):
        return _error(TOKEN_BLOCKED, 403)

    endpoint = request.endpoint or ""
    if endpoint in ALLOWED_ENDPOINTS or endpoint.startswith(ALLOWED_PREFIXES):
        return None

    # Lets CTFd log out a session whose password hash no longer matches.
    get_current_user()

    if is_verified():
        return None

    if request.path.startswith("/api/"):
        return _error(MFA_REQUIRED, 401)

    row = AdminMfa.query.get(session["id"])
    if row is not None and row.enabled:
        return redirect(url_for("admin_mfa.verify", next=request.full_path))
    return redirect(url_for("admin_mfa.setup"))
