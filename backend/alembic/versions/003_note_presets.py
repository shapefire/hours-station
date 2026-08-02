"""note presets for settings

Revision ID: 003_note_presets
Revises: 002_employee_is_active
Create Date: 2026-08-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003_note_presets"
down_revision: Union[str, Sequence[str], None] = "002_employee_is_active"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "note_presets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.String(length=200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("text"),
    )


def downgrade() -> None:
    op.drop_table("note_presets")
