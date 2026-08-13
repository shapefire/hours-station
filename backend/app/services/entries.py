from datetime import date, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models import WorkEntry
from app.services.employees import get_or_create_employee
from app.services.hours import effective_hours

STATUS_LABEL = {
    "on_duty": "到岗",
    "rest": "休息",
    "leave": "请假",
    "support": "支援",
}


def format_effective_hours(start: time, end: time) -> str:
    hours: Decimal = effective_hours(start, end)
    return f"{hours:.1f}"


def _normalize_entry_fields(
    *,
    status: str,
    is_external: bool,
    is_trial: bool,
    start_time: time | None,
    end_time: time | None,
) -> tuple[str, bool, bool, time | None, time | None]:
    if status not in STATUS_LABEL:
        raise ValueError("无效状态")
    if status in ("rest", "leave"):
        if start_time is not None or end_time is not None:
            raise ValueError("休息/请假不能填写时段")
        if is_external or is_trial:
            raise ValueError("休息/请假不能标记外援或试工")
        return status, False, False, None, None
    if status == "support":
        if start_time is None or end_time is None:
            raise ValueError("支援必须填写开始与结束时间")
        if is_external or is_trial:
            raise ValueError("支援不能标记外援或试工")
        format_effective_hours(start_time, end_time)
        return status, False, False, start_time, end_time
    # on_duty
    if start_time is None or end_time is None:
        raise ValueError("到岗必须填写开始与结束时间")
    format_effective_hours(start_time, end_time)
    return status, bool(is_external), bool(is_trial), start_time, end_time


def format_entry_hours(entry: WorkEntry) -> str:
    if entry.status in ("rest", "leave") or entry.start_time is None or entry.end_time is None:
        return "0.0"
    return format_effective_hours(entry.start_time, entry.end_time)


def entry_to_dict(entry: WorkEntry) -> dict:
    return {
        "id": entry.id,
        "work_date": entry.work_date,
        "employee_id": entry.employee_id,
        "employee_name": entry.employee.name,
        "status": entry.status,
        "is_external": entry.is_external,
        "is_trial": entry.is_trial,
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "note": entry.note,
        "effective_hours": format_entry_hours(entry),
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
    existing = db.scalars(stmt).one_or_none()
    if existing is not None:
        label = STATUS_LABEL.get(existing.status, existing.status)
        raise LookupError(f"该员工当日已在{label}")


def create_entry(
    db: Session,
    *,
    work_date: date,
    name: str,
    status: str = "on_duty",
    is_external: bool = False,
    is_trial: bool = False,
    start_time: time | None = None,
    end_time: time | None = None,
    note: str | None = None,
) -> WorkEntry:
    status, is_external, is_trial, start_time, end_time = _normalize_entry_fields(
        status=status,
        is_external=is_external,
        is_trial=is_trial,
        start_time=start_time,
        end_time=end_time,
    )
    employee = get_or_create_employee(db, name)
    _ensure_unique_day_employee(db, work_date=work_date, employee_id=employee.id)

    entry = WorkEntry(
        work_date=work_date,
        employee_id=employee.id,
        status=status,
        is_external=is_external,
        is_trial=is_trial,
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
    entries = list(
        db.scalars(
            select(WorkEntry)
            .options(joinedload(WorkEntry.employee))
            .where(WorkEntry.work_date == work_date)
            .order_by(WorkEntry.status, WorkEntry.start_time, WorkEntry.id)
        ).unique().all()
    )
    # SQLite lacks reliable NULLS LAST; keep null times after timed rows within status.
    entries.sort(
        key=lambda e: (
            e.status,
            e.start_time is None,
            e.start_time or time.min,
            str(e.id),
        )
    )
    return entries


def update_entry(db: Session, entry_id: UUID, fields: dict) -> WorkEntry:
    entry = _get_entry(db, entry_id)
    if entry is None:
        raise KeyError("排班不存在")

    if "work_date" in fields and fields["work_date"] is not None:
        entry.work_date = fields["work_date"]
    if "note" in fields:
        entry.note = fields["note"]

    status = fields["status"] if "status" in fields and fields["status"] is not None else entry.status
    is_external = (
        fields["is_external"] if "is_external" in fields and fields["is_external"] is not None else entry.is_external
    )
    is_trial = fields["is_trial"] if "is_trial" in fields and fields["is_trial"] is not None else entry.is_trial

    clear_times = bool(fields.get("clear_times"))
    if status in ("rest", "leave") or clear_times:
        start_time = None
        end_time = None
    else:
        start_time = fields["start_time"] if "start_time" in fields else entry.start_time
        end_time = fields["end_time"] if "end_time" in fields else entry.end_time

    # Non-on_duty statuses forbid flags; clear before normalize so status-only PATCH succeeds.
    if status != "on_duty":
        is_external = False
        is_trial = False

    status, is_external, is_trial, start_time, end_time = _normalize_entry_fields(
        status=status,
        is_external=is_external,
        is_trial=is_trial,
        start_time=start_time,
        end_time=end_time,
    )
    entry.status = status
    entry.is_external = is_external
    entry.is_trial = is_trial
    entry.start_time = start_time
    entry.end_time = end_time

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


def clear_entries_by_date(db: Session, work_date: date) -> int:
    entries = list_entries_by_date(db, work_date)
    count = len(entries)
    for entry in entries:
        db.delete(entry)
    if count:
        db.flush()
    return count


def copy_day(db: Session, *, from_date: date, to_date: date) -> dict:
    sources = list_entries_by_date(db, from_date)
    if not sources:
        raise ValueError("当日无安排可复制")

    copied = 0
    skipped_names: list[str] = []
    for source in sources:
        exists = db.scalars(
            select(WorkEntry).where(
                WorkEntry.work_date == to_date,
                WorkEntry.employee_id == source.employee_id,
            )
        ).one_or_none()
        if exists is not None:
            skipped_names.append(source.employee.name)
            continue

        entry = WorkEntry(
            work_date=to_date,
            employee_id=source.employee_id,
            start_time=source.start_time,
            end_time=source.end_time,
            note=source.note,
        )
        try:
            with db.begin_nested():
                db.add(entry)
                db.flush()
        except IntegrityError:
            skipped_names.append(source.employee.name)
            continue
        copied += 1

    return {
        "copied": copied,
        "skipped": len(skipped_names),
        "skipped_names": skipped_names,
    }


def copy_person(
    db: Session,
    *,
    source_entry_id: UUID,
    name: str,
    work_date: date,
) -> WorkEntry:
    source = _get_entry(db, source_entry_id)
    if source is None:
        raise KeyError("排班不存在")
    return create_entry(
        db,
        work_date=work_date,
        name=name,
        start_time=source.start_time,
        end_time=source.end_time,
        note=source.note,
    )
