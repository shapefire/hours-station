"""work entry status flags and nullable times

Revision ID: 005_work_entry_status
Revises: 004_hours_rule_tiers
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005_work_entry_status"
down_revision: Union[str, Sequence[str], None] = "004_hours_rule_tiers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "work_entries",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="on_duty"),
    )
    op.add_column(
        "work_entries",
        sa.Column("is_external", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "work_entries",
        sa.Column("is_trial", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.alter_column("work_entries", "start_time", existing_type=sa.Time(), nullable=True)
    op.alter_column("work_entries", "end_time", existing_type=sa.Time(), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE work_entries SET start_time = '00:00' WHERE start_time IS NULL")
    op.execute("UPDATE work_entries SET end_time = '00:01' WHERE end_time IS NULL")
    op.alter_column("work_entries", "end_time", existing_type=sa.Time(), nullable=False)
    op.alter_column("work_entries", "start_time", existing_type=sa.Time(), nullable=False)
    op.drop_column("work_entries", "is_trial")
    op.drop_column("work_entries", "is_external")
    op.drop_column("work_entries", "status")
