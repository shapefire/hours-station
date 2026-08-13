from decimal import Decimal
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import HoursRuleTier
from app.services.hours import DEFAULT_TIERS

_cached_tiers: list[tuple[Decimal, Decimal]] | None = None

def get_cached_tiers() -> list[tuple[Decimal, Decimal]]:
    global _cached_tiers
    if _cached_tiers is None:
        return list(DEFAULT_TIERS)
    return list(_cached_tiers)

def set_cached_tiers(tiers: Sequence[tuple[Decimal, Decimal]]) -> None:
    global _cached_tiers
    _cached_tiers = list(tiers) if tiers else list(DEFAULT_TIERS)

def clear_cached_tiers_for_tests() -> None:
    global _cached_tiers
    _cached_tiers = None

def load_hours_rule_cache(db: Session) -> list[tuple[Decimal, Decimal]]:
    rows = list(
        db.scalars(
            select(HoursRuleTier).order_by(HoursRuleTier.min_hours.desc())
        ).all()
    )
    if not rows:
        db.add(
            HoursRuleTier(
                min_hours=DEFAULT_TIERS[0][0],
                deduct_hours=DEFAULT_TIERS[0][1],
                sort_order=0,
            )
        )
        db.flush()
        rows = list(
            db.scalars(
                select(HoursRuleTier).order_by(HoursRuleTier.min_hours.desc())
            ).all()
        )
    tiers = [(Decimal(str(r.min_hours)), Decimal(str(r.deduct_hours))) for r in rows]
    set_cached_tiers(tiers)
    return tiers
