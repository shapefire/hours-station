from datetime import time, datetime, date
from decimal import Decimal, ROUND_HALF_UP
from typing import Sequence

DEFAULT_TIERS: list[tuple[Decimal, Decimal]] = [(Decimal("6.0"), Decimal("0.5"))]

def effective_hours(
    start: time,
    end: time,
    tiers: Sequence[tuple[Decimal, Decimal]] | None = None,
) -> Decimal:
    if end <= start:
        raise ValueError("结束时间必须晚于开始时间")
    start_dt = datetime.combine(date.min, start)
    end_dt = datetime.combine(date.min, end)
    raw = Decimal(str((end_dt - start_dt).total_seconds() / 3600))

    resolved: list[tuple[Decimal, Decimal]]
    if tiers is None:
        from app.services.hours_rule_cache import get_cached_tiers
        resolved = list(get_cached_tiers())
    else:
        resolved = list(tiers)
    if not resolved:
        resolved = list(DEFAULT_TIERS)

    deduct = Decimal("0")
    for min_hours, deduct_hours in sorted(resolved, key=lambda t: t[0], reverse=True):
        if raw >= min_hours:
            deduct = deduct_hours if deduct_hours > 0 else Decimal("0")
            break

    effective = raw - deduct
    return effective.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
