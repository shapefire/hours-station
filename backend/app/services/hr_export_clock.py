from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP


def time_to_hour_number(t: time) -> Decimal:
    raw = Decimal(t.hour) + (Decimal(t.minute) / Decimal(60))
    return raw.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def excel_hour_value(value: Decimal) -> int | float:
    q = value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    if q == q.to_integral_value():
        return int(q)
    return float(q)


def _span_hours(start: time, end: time) -> Decimal:
    start_dt = datetime.combine(date.min, start)
    end_dt = datetime.combine(date.min, end)
    raw = Decimal(str((end_dt - start_dt).total_seconds() / 3600))
    return raw.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def clock_in_out_for_entry(entry) -> tuple[Decimal | None, Decimal | None]:
    status = entry.status
    ot_start, ot_end = entry.ot_start_time, entry.ot_end_time
    ot = (
        _span_hours(ot_start, ot_end)
        if ot_start is not None and ot_end is not None
        else Decimal("0")
    )
    if status in ("rest", "leave"):
        if ot_start is None or ot_end is None:
            return None, None
        return time_to_hour_number(ot_start), time_to_hour_number(ot_end)
    start, end = entry.start_time, entry.end_time
    if start is None or end is None:
        return None, None
    end_h = time_to_hour_number(end)
    # 主时段的扣减应与系统 effective_hours 口径一致：
    # - 未满足扣减档时 deduct=0，不应仍然额外写入 +0.5
    # - 未勾（skip_deduction=false）时才可能发生扣减
    from app.services.hours import effective_hours

    skip_deduction = bool(getattr(entry, "skip_deduction", False))
    effective_main = effective_hours(start, end, skip_deduction=skip_deduction)
    # Excel 模板通过 (下班 - 上班) 得出当日有效工时：
    # 这里让 (end_h - start_h_adjusted) 等于 effective_main
    start_h_adjusted = end_h - effective_main
    return start_h_adjusted, end_h + ot
