from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DayNote


def get_day_note(db: Session, work_date: date) -> str | None:
    row = db.scalars(select(DayNote).where(DayNote.work_date == work_date)).one_or_none()
    if row is None:
        return None
    return row.note


def put_day_note(db: Session, work_date: date, note: str) -> str | None:
    cleaned = (note or "").strip()
    existing = db.scalars(select(DayNote).where(DayNote.work_date == work_date)).one_or_none()
    if not cleaned:
        if existing is not None:
            db.delete(existing)
            db.flush()
        return None
    if existing is None:
        existing = DayNote(work_date=work_date, note=cleaned)
        db.add(existing)
    else:
        existing.note = cleaned
    db.flush()
    return existing.note
