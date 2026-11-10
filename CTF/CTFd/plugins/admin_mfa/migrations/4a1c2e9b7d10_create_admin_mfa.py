"""Create admin_mfa table

Revision ID: 4a1c2e9b7d10
Revises:
Create Date: 2026-11-10 00:00:00

"""
import sqlalchemy as sa

revision = "4a1c2e9b7d10"
down_revision = None
branch_labels = None
depends_on = None


def upgrade(op=None):
    op.create_table(
        "admin_mfa",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("secret_enc", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_counter", sa.BigInteger(), nullable=True),
        sa.Column("recovery_hashes", sa.Text(), nullable=False),
        sa.Column("created", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade(op=None):
    op.drop_table("admin_mfa")
