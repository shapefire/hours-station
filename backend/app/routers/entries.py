from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import CopyDayIn, CopyDayOut, CopyPersonIn, EntryCreate, EntryOut, EntryUpdate
from app.services import entries as entries_service

router = APIRouter(prefix="/api/entries", tags=["entries"])


def _exc_detail(exc: Exception) -> str:
    if exc.args:
        return str(exc.args[0])
    return str(exc)


def _http_from_domain(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_exc_detail(exc))
    if isinstance(exc, LookupError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_exc_detail(exc))
    if isinstance(exc, KeyError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_exc_detail(exc))
    raise exc


@router.post("", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(payload: EntryCreate, db: Session = Depends(get_db)):
    try:
        entry = entries_service.create_entry(
            db,
            work_date=payload.work_date,
            name=payload.name,
            status=payload.status,
            is_external=payload.is_external,
            is_trial=payload.is_trial,
            start_time=payload.start_time,
            end_time=payload.end_time,
            note=payload.note,
            ot_start_time=payload.ot_start_time,
            ot_end_time=payload.ot_end_time,
        )
    except (ValueError, LookupError) as exc:
        raise _http_from_domain(exc) from exc
    return EntryOut.model_validate(entries_service.entry_to_dict(entry))


@router.get("", response_model=list[EntryOut])
def list_entries(
    work_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
):
    entries = entries_service.list_entries_by_date(db, work_date)
    return [EntryOut.model_validate(entries_service.entry_to_dict(e)) for e in entries]


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_day_entries(
    work_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
):
    entries_service.clear_entries_by_date(db, work_date)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/copy-day", response_model=CopyDayOut)
def copy_day(payload: CopyDayIn, db: Session = Depends(get_db)):
    try:
        result = entries_service.copy_day(
            db,
            from_date=payload.from_date,
            to_date=payload.to_date,
        )
    except (ValueError, LookupError) as exc:
        raise _http_from_domain(exc) from exc
    return CopyDayOut.model_validate(result)


@router.post("/copy-person", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def copy_person(payload: CopyPersonIn, db: Session = Depends(get_db)):
    try:
        entry = entries_service.copy_person(
            db,
            source_entry_id=payload.source_entry_id,
            name=payload.name,
            work_date=payload.date,
        )
    except (ValueError, LookupError, KeyError) as exc:
        raise _http_from_domain(exc) from exc
    return EntryOut.model_validate(entries_service.entry_to_dict(entry))


@router.patch("/{entry_id}", response_model=EntryOut)
def patch_entry(entry_id: UUID, payload: EntryUpdate, db: Session = Depends(get_db)):
    fields = payload.model_dump(exclude_unset=True)
    try:
        entry = entries_service.update_entry(db, entry_id, fields)
    except (ValueError, LookupError, KeyError) as exc:
        raise _http_from_domain(exc) from exc
    return EntryOut.model_validate(entries_service.entry_to_dict(entry))


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: UUID, db: Session = Depends(get_db)):
    try:
        entries_service.delete_entry(db, entry_id)
    except KeyError as exc:
        raise _http_from_domain(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
