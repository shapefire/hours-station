"""ot times and day_notes

Revision ID: 006_ot_and_day_notes
Revises: 005_work_entry_status
Create Date: 2026-08-18
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006_ot_and_day_notes"
down_revision: Union[str, Sequence[str], None] = "005_work_entry_status"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("work_entries", sa.Column("ot_start_time", sa.Time(), nullable=True))
    op.add_column("work_entries", sa.Column("ot_end_time", sa.Time(), nullable=True))
    op.create_table(
        "day_notes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("work_date", name="uq_day_notes_work_date"),
    )

def downgrade() -> None:
    op.drop_table("day_notes")
    op.drop_column("work_entries", "ot_end_time")
    op.drop_column("work_entries", "ot_start_time")
