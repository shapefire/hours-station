import calendar
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import Employee, WorkEntry
from app.services.entries import entry_hours_decimal, format_entry_hours

_STATUS_MAP = {
    "on_duty": "work",
    "rest": "rest",
    "leave": "leave",
    "support": "support",
}


def _format_hours(value: Decimal) -> str:
    return f"{value:.1f}"


def _month_range(year: int, month: int) -> tuple[date, date, int]:
    days_in_month = calendar.monthrange(year, month)[1]
    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1)
    else:
        month_end = date(year, month + 1, 1)
    return month_start, month_end, days_in_month


def monthly_stats(db: Session, *, year: int, month: int) -> dict:
    month_start, month_end, days_in_month = _month_range(year, month)
    entries = db.scalars(
        select(WorkEntry)
        .options(joinedload(WorkEntry.employee))
        .where(WorkEntry.work_date >= month_start, WorkEntry.work_date < month_end)
    ).unique().all()

    by_employee: dict[UUID, list[WorkEntry]] = defaultdict(list)
    for entry in entries:
        by_employee[entry.employee_id].append(entry)

    people: list[dict] = []
    month_total = Decimal("0")
    attendance_person_days = 0

    for employee_id, emp_entries in by_employee.items():
        duty_entries = [e for e in emp_entries if e.status == "on_duty"]
        support_entries = [e for e in emp_entries if e.status == "support"]
        rest_entries = [e for e in emp_entries if e.status == "rest"]
        leave_entries = [e for e in emp_entries if e.status == "leave"]
        attendance_days = len({e.work_date for e in duty_entries})
        support_days = len({e.work_date for e in support_entries})
        rest_days = len({e.work_date for e in rest_entries})
        leave_days = len({e.work_date for e in leave_entries})
        support_total = sum(
            (entry_hours_decimal(e) for e in support_entries),
            Decimal("0"),
        )
        total = sum(
            (entry_hours_decimal(e) for e in duty_entries),
            Decimal("0"),
        )
        total += sum(
            (entry_hours_decimal(e) for e in emp_entries if e.status in ("rest", "leave")),
            Decimal("0"),
        )
        month_total += total
        attendance_person_days += attendance_days
        avg_hours = _format_hours(total / attendance_days) if attendance_days else None
        people.append(
            {
                "employee_id": employee_id,
                "name": emp_entries[0].employee.name,
                "attendance_days": attendance_days,
                "rest_days": rest_days,
                "leave_days": leave_days,
                "support_days": support_days,
                "support_hours": _format_hours(support_total),
                "total_hours": _format_hours(total),
                "avg_hours": avg_hours,
            }
        )

    people.sort(key=lambda p: Decimal(p["total_hours"]), reverse=True)

    return {
        "year": year,
        "month": month,
        "total_hours": _format_hours(month_total),
        "employee_count": len(people),
        "attendance_person_days": attendance_person_days,
        "people": people,
    }


def employee_month_days(
    db: Session,
    *,
    employee_id: UUID,
    year: int,
    month: int,
) -> dict:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise KeyError("员工不存在")

    month_start, month_end, days_in_month = _month_range(year, month)
    entries = db.scalars(
        select(WorkEntry).where(
            WorkEntry.employee_id == employee_id,
            WorkEntry.work_date >= month_start,
            WorkEntry.work_date < month_end,
        )
    ).all()
    by_date = {e.work_date: e for e in entries}

    days: list[dict] = []
    for offset in range(days_in_month):
        day = month_start + timedelta(days=offset)
        entry = by_date.get(day)
        if entry is None:
            days.append(
                {
                    "date": day,
                    "status": "unassigned",
                    "start_time": None,
                    "end_time": None,
                    "effective_hours": None,
                }
            )
        else:
            st = _STATUS_MAP[entry.status]
            hours = None
            if entry.status in ("on_duty", "support"):
                hours = format_entry_hours(entry)
            elif entry.status in ("rest", "leave") and entry_hours_decimal(entry) > 0:
                hours = format_entry_hours(entry)
            days.append(
                {
                    "date": day,
                    "status": st,
                    "start_time": entry.start_time,
                    "end_time": entry.end_time,
                    "effective_hours": hours,
                }
            )

    return {"days": days}
