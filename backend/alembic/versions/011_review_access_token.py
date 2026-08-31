"""employee review_access_token

Revision ID: 011_review_access_token
Revises: 010_timesheet_reviews
Create Date: 2026-09-01
"""
from typing import Sequence, Union
import secrets

from alembic import op
import sqlalchemy as sa

revision: str = "011_review_access_token"
down_revision: Union[str, Sequence[str], None] = "010_timesheet_reviews"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("review_access_token", sa.String(length=64), nullable=True))
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM employees WHERE review_access_token IS NULL")).fetchall()
    for (emp_id,) in rows:
        token = secrets.token_urlsafe(32)
        conn.execute(
            sa.text("UPDATE employees SET review_access_token = :token WHERE id = :id"),
            {"token": token, "id": emp_id},
        )
    op.create_index("ix_employees_review_access_token", "employees", ["review_access_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_employees_review_access_token", table_name="employees")
    op.drop_column("employees", "review_access_token")
