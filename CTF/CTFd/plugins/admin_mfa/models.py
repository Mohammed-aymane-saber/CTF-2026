import datetime
import json

from CTFd.models import db


class AdminMfa(db.Model):
    __tablename__ = "admin_mfa"

    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    secret_enc = db.Column(db.Text, nullable=False)
    enabled = db.Column(db.Boolean, nullable=False, default=False)
    last_counter = db.Column(db.BigInteger, nullable=True)
    recovery_hashes = db.Column(db.Text, nullable=False, default="[]")
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def get_recovery(self):
        return json.loads(self.recovery_hashes or "[]")

    def set_recovery(self, hashes):
        self.recovery_hashes = json.dumps(list(hashes))
