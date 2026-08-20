import re
from calendar import monthrange
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Employee, WorkEntry

_ROSTER_SPLIT = re.compile(r"[\s、,，；;]+")


class NameConflictError(Exception):
    def __init__(self, existing_id: UUID, existing_name: str):
        self.existing_id = existing_id
        self.existing_name = existing_name
        super().__init__(existing_name)


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
    max_order = db.scalar(select(func.coalesce(func.max(Employee.sort_order), -1)))
    if max_order is None:
        max_order = -1
    emp = Employee(name=cleaned, is_active=True, sort_order=int(max_order) + 1)
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
    stmt = select(Employee).where(Employee.is_active.is_(True)).order_by(
        Employee.sort_order, Employee.created_at
    )
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
        row = {
            "id": emp.id,
            "name": emp.name,
            "export_name": emp.export_name,
            "position": emp.position,
            "sort_order": emp.sort_order,
        }
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


def rename_employee(db: Session, employee_id: UUID, raw_name: str) -> Employee:
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise KeyError("员工不存在")
    cleaned = raw_name.strip()
    if not cleaned:
        raise ValueError("姓名不能为空")
    if len(cleaned) > 64:
        raise ValueError("姓名最长 64 字")
    if emp.name == cleaned:
        return emp
    conflict = db.scalars(
        select(Employee).where(
            Employee.name == cleaned,
            Employee.is_active.is_(True),
            Employee.id != employee_id,
        )
    ).one_or_none()
    if conflict is not None:
        raise NameConflictError(conflict.id, conflict.name)
    emp.name = cleaned
    db.flush()
    return emp


def _entry_summary(entry: WorkEntry) -> dict:
    return {
        "id": entry.id,
        "status": entry.status,
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "ot_start_time": entry.ot_start_time,
        "ot_end_time": entry.ot_end_time,
        "is_external": entry.is_external,
        "is_trial": entry.is_trial,
        "skip_deduction": bool(getattr(entry, "skip_deduction", False)),
        "note": entry.note,
    }


def _require_active_pair(db: Session, source_id: UUID, target_id: UUID) -> tuple[Employee, Employee]:
    if source_id == target_id:
        raise ValueError("不能合并同一人")
    source = db.get(Employee, source_id)
    target = db.get(Employee, target_id)
    if source is None or target is None:
        raise KeyError("员工不存在")
    if not source.is_active or not target.is_active:
        raise ValueError("只能合并活跃人员")
    return source, target


def merge_preview(db: Session, source_id: UUID, target_id: UUID) -> dict:
    source, target = _require_active_pair(db, source_id, target_id)
    source_entries = list(
        db.scalars(select(WorkEntry).where(WorkEntry.employee_id == source.id)).all()
    )
    target_by_date = {
        e.work_date: e
        for e in db.scalars(select(WorkEntry).where(WorkEntry.employee_id == target.id)).all()
    }
    conflicts: list[dict] = []
    movable_count = 0
    for entry in sorted(source_entries, key=lambda e: e.work_date):
        other = target_by_date.get(entry.work_date)
        if other is not None:
            conflicts.append({
                "work_date": entry.work_date,
                "source_entry": _entry_summary(entry),
                "target_entry": _entry_summary(other),
            })
        else:
            movable_count += 1
    return {
        "source_name": source.name,
        "target_name": target.name,
        "source_export_name": source.export_name,
        "target_export_name": target.export_name,
        "source_position": source.position,
        "target_position": target.position,
        "movable_count": movable_count,
        "conflicts": conflicts,
    }


def _apply_field_keep(source: Employee, target: Employee, field: str, keep: str) -> None:
    if keep == "empty":
        setattr(target, field, None)
        return
    chosen = source if keep == "source" else target
    setattr(target, field, getattr(chosen, field))


def merge_employees(
    db: Session,
    source_id: UUID,
    target_id: UUID,
    resolutions: list[dict],
    *,
    export_name_keep: str = "target",
    position_keep: str = "target",
) -> dict:
    source, target = _require_active_pair(db, source_id, target_id)
    preview = merge_preview(db, source_id, target_id)
    conflict_dates = {c["work_date"] for c in preview["conflicts"]}
    resolution_map = {r["work_date"]: r["keep"] for r in resolutions}
    if set(resolution_map.keys()) != conflict_dates:
        raise ValueError("冲突日期 resolution 不完整")

    merged_entries = 0
    discarded_entries = 0

    source_entries = list(
        db.scalars(select(WorkEntry).where(WorkEntry.employee_id == source.id)).all()
    )
    target_by_date = {
        e.work_date: e
        for e in db.scalars(select(WorkEntry).where(WorkEntry.employee_id == target.id)).all()
    }

    to_delete: list[WorkEntry] = []
    to_reassign: list[WorkEntry] = []

    for entry in source_entries:
        other = target_by_date.get(entry.work_date)
        if other is None:
            to_reassign.append(entry)
            continue
        keep = resolution_map[entry.work_date]
        if keep == "source":
            to_delete.append(other)
            to_reassign.append(entry)
            discarded_entries += 1
        else:
            to_delete.append(entry)
            discarded_entries += 1

    for doomed in to_delete:
        db.delete(doomed)
    db.flush()

    for entry in to_reassign:
        entry.employee_id = target.id
        merged_entries += 1

    _apply_field_keep(source, target, "export_name", export_name_keep)
    _apply_field_keep(source, target, "position", position_keep)
    source.is_active = False
    db.flush()

    return {
        "merged_entries": merged_entries,
        "discarded_entries": discarded_entries,
        "target": target,
    }


def update_employee(db: Session, employee_id: UUID, fields: dict) -> Employee:
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise KeyError("员工不存在")
    if "name" in fields:
        emp = rename_employee(db, employee_id, fields["name"])
    for key in ("export_name", "position"):
        if key not in fields:
            continue
        value = fields[key]
        if value is None:
            setattr(emp, key, None)
            continue
        cleaned = value.strip() if isinstance(value, str) else str(value)
        if not cleaned:
            setattr(emp, key, None)
            continue
        if len(cleaned) > 64:
            label = "导出姓名" if key == "export_name" else "岗位"
            raise ValueError(f"{label}最长 64 字")
        setattr(emp, key, cleaned)
    db.flush()
    return emp


def reorder_employees(db: Session, ids: list[UUID]) -> None:
    active = list(db.scalars(select(Employee).where(Employee.is_active.is_(True))).all())
    active_ids = {emp.id for emp in active}
    if len(ids) != len(active_ids) or set(ids) != active_ids:
        raise ValueError("排序名单与花名册不一致")
    by_id = {emp.id: emp for emp in active}
    for index, emp_id in enumerate(ids):
        by_id[emp_id].sort_order = index
    db.flush()
