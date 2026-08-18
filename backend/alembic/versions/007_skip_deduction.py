"""add skip_deduction to work_entries

Revision ID: 007_skip_deduction
Revises: 006_ot_and_day_notes
Create Date: 2026-08-19
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "007_skip_deduction"
down_revision: Union[str, Sequence[str], None] = "006_ot_and_day_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "work_entries",
        sa.Column("skip_deduction", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("work_entries", "skip_deduction")
