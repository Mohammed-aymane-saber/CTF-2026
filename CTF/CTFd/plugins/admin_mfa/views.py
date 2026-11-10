from flask import Blueprint

admin_mfa = Blueprint("admin_mfa", __name__, template_folder="templates")


@admin_mfa.route("/setup", methods=["GET", "POST"])
def setup():
    return "setup"


@admin_mfa.route("/verify", methods=["GET", "POST"])
def verify():
    return "verify"
