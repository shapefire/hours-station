"""Run Alembic upgrades on application startup."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def should_auto_migrate() -> bool:
    flag = os.getenv("SKIP_DB_MIGRATIONS", "").strip().lower()
    if flag in {"1", "true", "yes", "on"}:
        return False
    # Avoid applying migrations against the wrong DB during pytest.
    if "pytest" in sys.modules:
        return False
    return True


def run_alembic_upgrade() -> None:
    """Apply pending Alembic revisions up to head (idempotent)."""
    from alembic import command
    from alembic.config import Config

    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    # Ensure script_location resolves from backend/, even if process cwd differs.
    config.set_main_option("script_location", str(backend_root / "alembic"))
    logger.info("Running alembic upgrade head...")
    command.upgrade(config, "head")
    logger.info("Alembic migrations are up to date.")
