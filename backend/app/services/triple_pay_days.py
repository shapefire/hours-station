"""三薪日（triple_pay_days）服务：设置/取消、按月查询、区间批量查询。"""

from __future__ import annotations

from calendar import monthrange
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TriplePayDay


def set_triple_pay_day(db: Session, work_date: date, is_triple_pay: bool) -> bool:
    existing = db.scalars(
        select(TriplePayDay).where(TriplePayDay.work_date == work_date)
    ).one_or_none()
    if is_triple_pay:
        if existing is None:
            db.add(TriplePayDay(work_date=work_date))
        db.flush()
        return True
    if existing is not None:
        db.delete(existing)
        db.flush()
    return False


def list_triple_pay_dates(db: Session, year: int, month: int) -> list[date]:
    month_start = date(year, month, 1)
    month_end = date(year, month, monthrange(year, month)[1])
    rows = db.scalars(
        select(TriplePayDay)
        .where(TriplePayDay.work_date >= month_start, TriplePayDay.work_date <= month_end)
        .order_by(TriplePayDay.work_date)
    ).all()
    return [row.work_date for row in rows]


def triple_pay_dates_between(db: Session, start: date, end: date) -> set[date]:
    rows = db.scalars(
        select(TriplePayDay).where(
            TriplePayDay.work_date >= start, TriplePayDay.work_date <= end
        )
    ).all()
    return {row.work_date for row in rows}
