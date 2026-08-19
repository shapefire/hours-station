"""store_settings with default store name

Revision ID: 009_store_settings
Revises: 008_employee_export_fields
Create Date: 2026-08-19
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "009_store_settings"
down_revision: Union[str, Sequence[str], None] = "008_employee_export_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "store_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("store_name", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    store_settings = sa.table(
        "store_settings",
        sa.column("id", sa.Integer),
        sa.column("store_name", sa.String),
    )
    op.bulk_insert(store_settings, [{"id": 1, "store_name": "东圃地铁站"}])


def downgrade() -> None:
    op.drop_table("store_settings")
