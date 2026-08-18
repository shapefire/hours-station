from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import DayNoteOut, DayNotePut
from app.services import day_notes as day_notes_service

router = APIRouter(prefix="/api/day-notes", tags=["day-notes"])


def _exc_detail(exc: Exception) -> str:
    if exc.args:
        return str(exc.args[0])
    return str(exc)


@router.put("/{work_date}", response_model=DayNoteOut)
def upsert_day_note(work_date: date, payload: DayNotePut, db: Session = Depends(get_db)):
    try:
        note = day_notes_service.put_day_note(db, work_date, payload.note)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_exc_detail(exc)) from exc
    return DayNoteOut(work_date=work_date, note=note)


@router.get("", response_model=DayNoteOut)
def read_day_note(
    work_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
):
    note = day_notes_service.get_day_note(db, work_date)
    return DayNoteOut(work_date=work_date, note=note)
