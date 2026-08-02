from datetime import time, datetime, date
from decimal import Decimal, ROUND_HALF_UP

def effective_hours(start: time, end: time) -> Decimal:
    if end <= start:
        raise ValueError("结束时间必须晚于开始时间")
    start_dt = datetime.combine(date.min, start)
    end_dt = datetime.combine(date.min, end)
    raw = Decimal(str((end_dt - start_dt).total_seconds() / 3600))
    effective = raw - Decimal("0.5") if raw >= Decimal("6") else raw
    return effective.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
