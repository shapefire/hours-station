"""employee export_name, position, sort_order

Revision ID: 008_employee_export_fields
Revises: 007_skip_deduction
Create Date: 2026-08-19
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "008_employee_export_fields"
down_revision: Union[str, Sequence[str], None] = "007_skip_deduction"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("export_name", sa.String(64), nullable=True))
    op.add_column("employees", sa.Column("position", sa.String(64), nullable=True))
    op.add_column(
        "employees",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("employees", "sort_order")
    op.drop_column("employees", "position")
    op.drop_column("employees", "export_name")
