from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import NotePresetCreate, NotePresetOut
from app.services import settings as settings_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _exc_detail(exc: Exception) -> str:
    if exc.args:
        return str(exc.args[0])
    return str(exc)


@router.get("/note-presets", response_model=list[NotePresetOut])
def list_note_presets(db: Session = Depends(get_db)):
    rows = settings_service.list_note_presets(db)
    return [NotePresetOut.model_validate(row) for row in rows]


@router.post("/note-presets", response_model=NotePresetOut, status_code=status.HTTP_201_CREATED)
def create_note_preset(payload: NotePresetCreate, db: Session = Depends(get_db)):
    try:
        preset = settings_service.create_note_preset(db, payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_exc_detail(exc)) from exc
    return NotePresetOut.model_validate(preset)


@router.delete("/note-presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note_preset(preset_id: UUID, db: Session = Depends(get_db)):
    try:
        settings_service.delete_note_preset(db, preset_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_exc_detail(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
