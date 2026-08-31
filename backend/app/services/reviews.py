import calendar
from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Employee, MonthlyReview, TimeDispute, WorkEntry
from app.services.entries import _normalize_ot_times, create_entry, format_effective_hours, update_entry


def _month_range(year: int, month: int) -> tuple[date, date, int]:
    days_in_month = calendar.monthrange(year, month)[1]
    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1)
    else:
        month_end = date(year, month + 1, 1)
    return month_start, month_end, days_in_month


def _require_employee(db: Session, name: str) -> Employee:
    cleaned = name.strip()
    emp = db.scalars(select(Employee).where(Employee.name == cleaned)).one_or_none()
    if emp is None:
        raise KeyError("员工不存在")
    return emp


def _validate_proposed_times(
    start: time | None,
    end: time | None,
    ot_start: time | None,
    ot_end: time | None,
) -> tuple[time | None, time | None]:
    if start is None or end is None:
        raise ValueError("到岗必须填写开始与结束时间")
    format_effective_hours(start, end)
    return _normalize_ot_times(ot_start, ot_end)


def _entry_snapshot(entry: WorkEntry | None) -> dict:
    if entry is None:
        return {
            "entry_id": None,
            "original_status": "unassigned",
            "original_start_time": None,
            "original_end_time": None,
            "original_ot_start_time": None,
            "original_ot_end_time": None,
        }
    return {
        "entry_id": entry.id,
        "original_status": entry.status,
        "original_start_time": entry.start_time,
        "original_end_time": entry.end_time,
        "original_ot_start_time": entry.ot_start_time,
        "original_ot_end_time": entry.ot_end_time,
    }


def _dispute_to_dict(dispute: TimeDispute) -> dict:
    return {
        "id": dispute.id,
        "work_date": dispute.work_date,
        "status": dispute.status,
        "original_status": dispute.original_status,
        "original_start_time": dispute.original_start_time,
        "original_end_time": dispute.original_end_time,
        "original_ot_start_time": dispute.original_ot_start_time,
        "original_ot_end_time": dispute.original_ot_end_time,
        "proposed_start_time": dispute.proposed_start_time,
        "proposed_end_time": dispute.proposed_end_time,
        "proposed_ot_start_time": dispute.proposed_ot_start_time,
        "proposed_ot_end_time": dispute.proposed_ot_end_time,
        "note": dispute.note,
    }


def _admin_dispute_to_dict(dispute: TimeDispute, employee_name: str) -> dict:
    return {
        **_dispute_to_dict(dispute),
        "employee_name": employee_name,
        "year": dispute.year,
        "month": dispute.month,
        "resolved_at": dispute.resolved_at,
        "resolved_entry_id": dispute.resolved_entry_id,
    }


def _get_dispute_or_raise(db: Session, dispute_id: UUID) -> TimeDispute:
    dispute = db.get(TimeDispute, dispute_id)
    if dispute is None:
        raise KeyError("异议不存在")
    return dispute


def _require_pending(dispute: TimeDispute) -> None:
    if dispute.status != "pending":
        raise LookupError("异议已处理")


def get_employee_month(db: Session, *, name: str, year: int, month: int) -> dict:
    emp = _require_employee(db, name)
    month_start, month_end, days_in_month = _month_range(year, month)

    review = db.scalars(
        select(MonthlyReview).where(
            MonthlyReview.employee_id == emp.id,
            MonthlyReview.year == year,
            MonthlyReview.month == month,
        )
    ).one_or_none()

    entries = list(
        db.scalars(
            select(WorkEntry).where(
                WorkEntry.employee_id == emp.id,
                WorkEntry.work_date >= month_start,
                WorkEntry.work_date < month_end,
            )
        ).all()
    )
    entry_by_date = {e.work_date: e for e in entries}

    days: list[dict] = []
    for day_num in range(1, days_in_month + 1):
        d = date(year, month, day_num)
        entry = entry_by_date.get(d)
        if entry is not None:
            days.append(
                {
                    "date": d,
                    "status": entry.status,
                    "start_time": entry.start_time,
                    "end_time": entry.end_time,
                    "ot_start_time": entry.ot_start_time,
                    "ot_end_time": entry.ot_end_time,
                    "entry_id": entry.id,
                }
            )
        else:
            days.append(
                {
                    "date": d,
                    "status": "unassigned",
                    "start_time": None,
                    "end_time": None,
                    "ot_start_time": None,
                    "ot_end_time": None,
                    "entry_id": None,
                }
            )

    disputes = list(
        db.scalars(
            select(TimeDispute)
            .where(
                TimeDispute.employee_id == emp.id,
                TimeDispute.year == year,
                TimeDispute.month == month,
            )
            .order_by(TimeDispute.work_date, TimeDispute.id)
        ).all()
    )

    return {
        "employee_id": emp.id,
        "name": emp.name,
        "year": year,
        "month": month,
        "reviewed": review is not None,
        "confirmed_at": review.confirmed_at if review else None,
        "days": days,
        "disputes": [_dispute_to_dict(d) for d in disputes],
    }


def submit_monthly_review(
    db: Session,
    *,
    name: str,
    year: int,
    month: int,
    disputes: list[dict],
) -> dict:
    emp = _require_employee(db, name)
    month_start, month_end, _ = _month_range(year, month)

    existing_review = db.scalars(
        select(MonthlyReview).where(
            MonthlyReview.employee_id == emp.id,
            MonthlyReview.year == year,
            MonthlyReview.month == month,
        )
    ).one_or_none()
    if existing_review is not None:
        raise LookupError("该月已核审")

    entries = list(
        db.scalars(
            select(WorkEntry).where(
                WorkEntry.employee_id == emp.id,
                WorkEntry.work_date >= month_start,
                WorkEntry.work_date < month_end,
            )
        ).all()
    )
    entry_by_date = {e.work_date: e for e in entries}

    dispute_rows: list[TimeDispute] = []
    seen_dates: set[date] = set()
    for item in disputes:
        work_date = item["work_date"]
        if work_date < month_start or work_date >= month_end:
            raise ValueError("异议日期须落在所选月份")
        if work_date in seen_dates:
            raise ValueError("同一天不能重复提交异议")
        seen_dates.add(work_date)

        ot_start, ot_end = _validate_proposed_times(
            item["proposed_start_time"],
            item["proposed_end_time"],
            item.get("proposed_ot_start_time"),
            item.get("proposed_ot_end_time"),
        )
        snapshot = _entry_snapshot(entry_by_date.get(work_date))
        dispute_rows.append(
            TimeDispute(
                employee_id=emp.id,
                work_date=work_date,
                year=year,
                month=month,
                entry_id=snapshot["entry_id"],
                original_status=snapshot["original_status"],
                original_start_time=snapshot["original_start_time"],
                original_end_time=snapshot["original_end_time"],
                original_ot_start_time=snapshot["original_ot_start_time"],
                original_ot_end_time=snapshot["original_ot_end_time"],
                proposed_start_time=item["proposed_start_time"],
                proposed_end_time=item["proposed_end_time"],
                proposed_ot_start_time=ot_start,
                proposed_ot_end_time=ot_end,
                note=item.get("note"),
                status="pending",
            )
        )

    review = MonthlyReview(employee_id=emp.id, year=year, month=month)
    try:
        with db.begin_nested():
            db.add(review)
            for row in dispute_rows:
                db.add(row)
            db.flush()
    except IntegrityError as exc:
        raise LookupError("该月已核审") from exc

    return {"reviewed": True, "dispute_count": len(dispute_rows)}


def list_disputes(
    db: Session,
    *,
    status: str | None = None,
    year: int | None = None,
    month: int | None = None,
) -> list[dict]:
    stmt = (
        select(TimeDispute, Employee.name)
        .join(Employee, TimeDispute.employee_id == Employee.id)
        .order_by(TimeDispute.work_date, TimeDispute.id)
    )
    if status is not None:
        stmt = stmt.where(TimeDispute.status == status)
    if year is not None:
        stmt = stmt.where(TimeDispute.year == year)
    if month is not None:
        stmt = stmt.where(TimeDispute.month == month)

    rows = db.execute(stmt).all()
    return [_admin_dispute_to_dict(dispute, employee_name) for dispute, employee_name in rows]


def confirm_dispute(db: Session, dispute_id: UUID) -> dict:
    dispute = _get_dispute_or_raise(db, dispute_id)
    _require_pending(dispute)

    emp = db.get(Employee, dispute.employee_id)
    assert emp is not None

    ot_start, ot_end = _validate_proposed_times(
        dispute.proposed_start_time,
        dispute.proposed_end_time,
        dispute.proposed_ot_start_time,
        dispute.proposed_ot_end_time,
    )

    entry = db.scalars(
        select(WorkEntry).where(
            WorkEntry.employee_id == dispute.employee_id,
            WorkEntry.work_date == dispute.work_date,
        )
    ).one_or_none()

    entry_fields = {
        "status": "on_duty",
        "start_time": dispute.proposed_start_time,
        "end_time": dispute.proposed_end_time,
        "ot_start_time": ot_start,
        "ot_end_time": ot_end,
    }
    if entry is not None:
        entry = update_entry(db, entry.id, entry_fields)
    else:
        entry = create_entry(
            db,
            work_date=dispute.work_date,
            name=emp.name,
            status="on_duty",
            start_time=dispute.proposed_start_time,
            end_time=dispute.proposed_end_time,
            ot_start_time=ot_start,
            ot_end_time=ot_end,
        )

    dispute.status = "confirmed"
    dispute.resolved_at = datetime.now(timezone.utc)
    dispute.resolved_entry_id = entry.id
    db.flush()

    return _admin_dispute_to_dict(dispute, emp.name)


def reject_dispute(db: Session, dispute_id: UUID) -> dict:
    dispute = _get_dispute_or_raise(db, dispute_id)
    _require_pending(dispute)

    emp = db.get(Employee, dispute.employee_id)
    assert emp is not None

    dispute.status = "rejected"
    dispute.resolved_at = datetime.now(timezone.utc)
    db.flush()

    return _admin_dispute_to_dict(dispute, emp.name)
