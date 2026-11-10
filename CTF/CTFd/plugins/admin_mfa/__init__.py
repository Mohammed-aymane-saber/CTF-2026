"""Admin MFA (TOTP) plugin for CTFd."""

from CTFd.plugins.migrations import upgrade

from .models import AdminMfa  # noqa: F401  (registers the table)


def load(app):
    upgrade(plugin_name="admin_mfa")
