from datetime import date, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models import WorkEntry
from app.services.employees import get_or_create_employee
from app.services.hours import effective_hours


def format_effective_hours(start: time, end: time) -> str:
    hours: Decimal = effective_hours(start, end)
    return f"{hours:.1f}"


def entry_to_dict(entry: WorkEntry) -> dict:
    return {
        "id": entry.id,
        "work_date": entry.work_date,
        "employee_id": entry.employee_id,
        "employee_name": entry.employee.name,
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "note": entry.note,
        "effective_hours": format_effective_hours(entry.start_time, entry.end_time),
    }


def _get_entry(db: Session, entry_id: UUID) -> WorkEntry | None:
    return db.scalars(
        select(WorkEntry)
        .options(joinedload(WorkEntry.employee))
        .where(WorkEntry.id == entry_id)
    ).unique().one_or_none()


def _ensure_unique_day_employee(
    db: Session,
    *,
    work_date: date,
    employee_id: UUID,
    exclude_id: UUID | None = None,
) -> None:
    stmt = select(WorkEntry).where(
        WorkEntry.work_date == work_date,
        WorkEntry.employee_id == employee_id,
    )
    if exclude_id is not None:
        stmt = stmt.where(WorkEntry.id != exclude_id)
    if db.scalars(stmt).one_or_none() is not None:
        raise LookupError("该员工当日已有排班")


def create_entry(
    db: Session,
    *,
    work_date: date,
    name: str,
    start_time: time,
    end_time: time,
    note: str | None = None,
) -> WorkEntry:
    format_effective_hours(start_time, end_time)
    employee = get_or_create_employee(db, name)
    _ensure_unique_day_employee(db, work_date=work_date, employee_id=employee.id)

    entry = WorkEntry(
        work_date=work_date,
        employee_id=employee.id,
        start_time=start_time,
        end_time=end_time,
        note=note,
    )
    try:
        with db.begin_nested():
            db.add(entry)
            db.flush()
    except IntegrityError as exc:
        raise LookupError("该员工当日已有排班") from exc

    loaded = _get_entry(db, entry.id)
    assert loaded is not None
    return loaded


def list_entries_by_date(db: Session, work_date: date) -> list[WorkEntry]:
    return list(
        db.scalars(
            select(WorkEntry)
            .options(joinedload(WorkEntry.employee))
            .where(WorkEntry.work_date == work_date)
            .order_by(WorkEntry.start_time, WorkEntry.id)
        ).unique().all()
    )


def update_entry(db: Session, entry_id: UUID, fields: dict) -> WorkEntry:
    entry = _get_entry(db, entry_id)
    if entry is None:
        raise KeyError("排班不存在")

    if "work_date" in fields and fields["work_date"] is not None:
        entry.work_date = fields["work_date"]
    if "start_time" in fields and fields["start_time"] is not None:
        entry.start_time = fields["start_time"]
    if "end_time" in fields and fields["end_time"] is not None:
        entry.end_time = fields["end_time"]
    if "note" in fields:
        entry.note = fields["note"]

    format_effective_hours(entry.start_time, entry.end_time)
    _ensure_unique_day_employee(
        db,
        work_date=entry.work_date,
        employee_id=entry.employee_id,
        exclude_id=entry.id,
    )
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError as exc:
        raise LookupError("该员工当日已有排班") from exc

    loaded = _get_entry(db, entry.id)
    assert loaded is not None
    return loaded


def delete_entry(db: Session, entry_id: UUID) -> None:
    entry = db.get(WorkEntry, entry_id)
    if entry is None:
        raise KeyError("排班不存在")
    db.delete(entry)
    db.flush()
