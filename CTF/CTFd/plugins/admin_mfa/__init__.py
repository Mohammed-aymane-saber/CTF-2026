"""Admin MFA (TOTP) plugin for CTFd."""

import click
from flask.cli import with_appcontext

from CTFd.models import Users, db
from CTFd.plugins.migrations import upgrade

from .crypto import get_fernet
from .gate import admin_mfa_gate
from .models import AdminMfa  # noqa: F401  (registers the table)
from .views import admin_mfa


@click.command("admin-mfa-reset")
@click.argument("email")
@with_appcontext
def admin_mfa_reset(email):
    """Remove an admin's MFA enrolment so they re-enrol at next login."""
    user = Users.query.filter_by(email=email, type="admin").first()
    if user is None:
        click.echo("No admin with that email", err=True)
        raise SystemExit(1)
    AdminMfa.query.filter_by(user_id=user.id).delete()
    db.session.commit()
    click.echo(f"MFA reset for {email}")


def load(app):
    upgrade(plugin_name="admin_mfa")
    get_fernet(app)  # fail fast on a malformed ADMIN_MFA_ENCRYPTION_KEY
    app.register_blueprint(admin_mfa, url_prefix="/admin-mfa")
    app.before_request(admin_mfa_gate)
    app.cli.add_command(admin_mfa_reset)
