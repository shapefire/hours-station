"""monthly_reviews and time_disputes

Revision ID: 010_timesheet_reviews
Revises: 009_store_settings
Create Date: 2026-08-31
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "010_timesheet_reviews"
down_revision: Union[str, Sequence[str], None] = "009_store_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "monthly_reviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "year", "month", name="uq_monthly_review_emp_ym"),
    )
    op.create_table(
        "time_disputes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("entry_id", sa.Uuid(), nullable=True),
        sa.Column("original_status", sa.String(length=16), nullable=False),
        sa.Column("original_start_time", sa.Time(), nullable=True),
        sa.Column("original_end_time", sa.Time(), nullable=True),
        sa.Column("original_ot_start_time", sa.Time(), nullable=True),
        sa.Column("original_ot_end_time", sa.Time(), nullable=True),
        sa.Column("proposed_start_time", sa.Time(), nullable=False),
        sa.Column("proposed_end_time", sa.Time(), nullable=False),
        sa.Column("proposed_ot_start_time", sa.Time(), nullable=True),
        sa.Column("proposed_ot_end_time", sa.Time(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_entry_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["entry_id"], ["work_entries.id"]),
        sa.ForeignKeyConstraint(["resolved_entry_id"], ["work_entries.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "work_date", name="uq_time_dispute_emp_day"),
    )
    op.create_index("ix_time_disputes_employee_id", "time_disputes", ["employee_id"])
    op.create_index("ix_time_disputes_work_date", "time_disputes", ["work_date"])


def downgrade() -> None:
    op.drop_index("ix_time_disputes_work_date", table_name="time_disputes")
    op.drop_index("ix_time_disputes_employee_id", table_name="time_disputes")
    op.drop_table("time_disputes")
    op.drop_table("monthly_reviews")
