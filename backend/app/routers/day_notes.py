from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import DayNoteOut, DayNotePut
from app.services import day_notes as day_notes_service

router = APIRouter(prefix="/api/day-notes", tags=["day-notes"])


@router.put("/{work_date}", response_model=DayNoteOut)
def upsert_day_note(work_date: date, payload: DayNotePut, db: Session = Depends(get_db)):
    note = day_notes_service.put_day_note(db, work_date, payload.note)
    return DayNoteOut(work_date=work_date, note=note)


@router.get("", response_model=DayNoteOut)
def read_day_note(
    work_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
):
    note = day_notes_service.get_day_note(db, work_date)
    return DayNoteOut(work_date=work_date, note=note)
