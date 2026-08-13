from calendar import monthrange
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Employee, WorkEntry
from app.services.hours import effective_hours


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


def _month_hours_by_employee(db: Session, year: int, month: int) -> dict[UUID, Decimal]:
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
        if entry.status != "on_duty":
            continue
        if entry.start_time is None or entry.end_time is None:
            continue
        hours = effective_hours(entry.start_time, entry.end_time)
        totals[entry.employee_id] = totals.get(entry.employee_id, Decimal("0")) + hours
    return totals


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
    include_hours = year is not None and month is not None
    if include_hours:
        hours_map = _month_hours_by_employee(db, year, month)

    rows: list[dict] = []
    for emp in employees:
        row = {"id": emp.id, "name": emp.name}
        if include_hours:
            total = hours_map.get(emp.id, Decimal("0"))
            row["month_hours"] = f"{total.quantize(Decimal('0.1'))}"
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
