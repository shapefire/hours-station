from collections import defaultdict
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import WorkEntry
from app.schemas import CalendarDayOut, CalendarMonthOut
from app.services.hours import effective_hours

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _format_hours(value: Decimal) -> str:
    return f"{value:.1f}"


@router.get("", response_model=CalendarMonthOut)
def get_calendar_month(
    year: int = Query(..., ge=1),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1)
    else:
        month_end = date(year, month + 1, 1)

    entries = db.scalars(
        select(WorkEntry)
        .where(WorkEntry.work_date >= month_start, WorkEntry.work_date < month_end)
        .order_by(WorkEntry.work_date, WorkEntry.id)
    ).all()

    by_date: dict[date, list[WorkEntry]] = defaultdict(list)
    for entry in entries:
        by_date[entry.work_date].append(entry)

    days: list[CalendarDayOut] = []
    month_total = Decimal("0")
    for work_date in sorted(by_date):
        day_entries = by_date[work_date]
        day_total = sum(
            (effective_hours(e.start_time, e.end_time) for e in day_entries),
            Decimal("0"),
        )
        month_total += day_total
        days.append(
            CalendarDayOut(
                date=work_date,
                entry_count=len(day_entries),
                total_effective_hours=_format_hours(day_total),
            )
        )

    return CalendarMonthOut(
        year=year,
        month=month,
        registered_days=len(days),
        month_total_hours=_format_hours(month_total),
        days=days,
    )
