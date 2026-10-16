"""triple_pay_days

Revision ID: 012_triple_pay_days
Revises: 011_review_access_token
Create Date: 2026-09-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "012_triple_pay_days"
down_revision: Union[str, Sequence[str], None] = "011_review_access_token"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "triple_pay_days",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("work_date", name="uq_triple_pay_days_work_date"),
    )


def downgrade() -> None:
    op.drop_table("triple_pay_days")
