"""Admin MFA (TOTP) plugin for CTFd."""

from CTFd.plugins.migrations import upgrade

from .crypto import get_fernet
from .gate import admin_mfa_gate
from .models import AdminMfa  # noqa: F401  (registers the table)
from .views import admin_mfa


def load(app):
    upgrade(plugin_name="admin_mfa")
    get_fernet(app)  # fail fast on a malformed ADMIN_MFA_ENCRYPTION_KEY
    app.register_blueprint(admin_mfa, url_prefix="/admin-mfa")
    app.before_request(admin_mfa_gate)
