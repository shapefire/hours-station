import re
from calendar import monthrange
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Employee, WorkEntry

_ROSTER_SPLIT = re.compile(r"[\s、,，；;]+")


def get_or_create_employee(db: Session, name: str) -> Employee:
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("姓名不能为空")
    emp = db.scalars(select(Employee).where(Employee.name == cleaned)).one_or_none()
    if emp:
        if not emp.is_active:
            emp.is_active = True
            db.flush()
        return emp
    emp = Employee(name=cleaned, is_active=True)
    try:
        with db.begin_nested():
            db.add(emp)
            db.flush()
    except IntegrityError:
        emp = db.scalars(select(Employee).where(Employee.name == cleaned)).one()
        if not emp.is_active:
            emp.is_active = True
            db.flush()
    return emp


def parse_roster_text(text: str) -> list[str]:
    if not text:
        return []
    names: list[str] = []
    seen: set[str] = set()
    for part in _ROSTER_SPLIT.split(text):
        name = part.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def ensure_active_employee(db: Session, name: str) -> tuple[Employee, str]:
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("姓名不能为空")
    if len(cleaned) > 64:
        raise ValueError("姓名最长 64 字")
    existing = db.scalars(select(Employee).where(Employee.name == cleaned)).one_or_none()
    if existing is not None:
        if existing.is_active:
            return existing, "existing"
        existing.is_active = True
        db.flush()
        return existing, "reactivated"
    emp = get_or_create_employee(db, cleaned)
    return emp, "created"


def import_employees(db: Session, text: str) -> dict:
    names = parse_roster_text(text)
    if not names:
        raise ValueError("没有可导入的姓名")
    created = 0
    reactivated = 0
    skipped_existing = 0
    skipped_invalid = 0
    kept: list[str] = []
    for name in names:
        if len(name) > 64:
            skipped_invalid += 1
            continue
        emp, outcome = ensure_active_employee(db, name)
        if outcome == "created":
            created += 1
        elif outcome == "reactivated":
            reactivated += 1
        else:
            skipped_existing += 1
        kept.append(emp.name)
    return {
        "created": created,
        "reactivated": reactivated,
        "skipped_existing": skipped_existing,
        "skipped_invalid": skipped_invalid,
        "names": kept,
    }


def _month_hours_by_employee(db: Session, year: int, month: int) -> dict[UUID, Decimal]:
    from app.services.entries import entry_hours_decimal

    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    entries = list(
        db.scalars(
            select(WorkEntry).where(
                WorkEntry.work_date >= start,
                WorkEntry.work_date <= end,
            )
        ).all()
    )
    totals: dict[UUID, Decimal] = {}
    for entry in entries:
        if entry.status == "support":
            continue
        if entry.status == "on_duty":
            hours = entry_hours_decimal(entry)
        elif entry.status in ("rest", "leave"):
            if entry.ot_start_time is None or entry.ot_end_time is None:
                continue
            hours = entry_hours_decimal(entry)
        else:
            continue
        totals[entry.employee_id] = totals.get(entry.employee_id, Decimal("0")) + hours
    return totals


def _month_rest_days_by_employee(db: Session, year: int, month: int) -> dict[UUID, int]:
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    entries = list(
        db.scalars(
            select(WorkEntry).where(
                WorkEntry.work_date >= start,
                WorkEntry.work_date <= end,
                WorkEntry.status == "rest",
            )
        ).all()
    )
    counts: dict[UUID, int] = {}
    for entry in entries:
        counts[entry.employee_id] = counts.get(entry.employee_id, 0) + 1
    return counts


def list_employees(
    db: Session,
    q: str | None = None,
    *,
    year: int | None = None,
    month: int | None = None,
) -> list[dict]:
    """Active roster; optionally include month_hours for the given calendar month."""
    stmt = select(Employee).where(Employee.is_active.is_(True)).order_by(Employee.name)
    if q is not None and (needle := q.strip()):
        stmt = stmt.where(Employee.name.contains(needle))
    employees = list(db.scalars(stmt).all())

    hours_map: dict[UUID, Decimal] = {}
    rest_map: dict[UUID, int] = {}
    include_month_stats = year is not None and month is not None
    if include_month_stats:
        hours_map = _month_hours_by_employee(db, year, month)
        rest_map = _month_rest_days_by_employee(db, year, month)

    rows: list[dict] = []
    for emp in employees:
        row = {"id": emp.id, "name": emp.name}
        if include_month_stats:
            total = hours_map.get(emp.id, Decimal("0"))
            row["month_hours"] = f"{total.quantize(Decimal('0.1'))}"
            row["month_rest_days"] = rest_map.get(emp.id, 0)
        rows.append(row)
    return rows


def deactivate_employee(db: Session, employee_id: UUID) -> Employee:
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise KeyError("员工不存在")
    if not emp.is_active:
        return emp
    emp.is_active = False
    db.flush()
    return emp
