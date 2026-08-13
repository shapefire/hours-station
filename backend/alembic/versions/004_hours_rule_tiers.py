"""hours rule tiers

Revision ID: 004_hours_rule_tiers
Revises: 003_note_presets
Create Date: 2026-08-13
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa

revision: str = "004_hours_rule_tiers"
down_revision: Union[str, Sequence[str], None] = "003_note_presets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hours_rule_tiers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("min_hours", sa.Numeric(4, 1), nullable=False),
        sa.Column("deduct_hours", sa.Numeric(4, 1), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("min_hours"),
    )
    op.execute(
        sa.text(
            "INSERT INTO hours_rule_tiers (id, min_hours, deduct_hours, sort_order) "
            "VALUES (:id, 6.0, 0.5, 0)"
        ).bindparams(id=uuid.uuid4())
    )


def downgrade() -> None:
    op.drop_table("hours_rule_tiers")
