from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import NotePreset


def list_note_presets(db: Session) -> list[NotePreset]:
    return list(
        db.scalars(
            select(NotePreset).order_by(NotePreset.sort_order, NotePreset.created_at)
        ).all()
    )


def create_note_preset(db: Session, text: str) -> NotePreset:
    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("备注预设不能为空")
    if len(cleaned) > 200:
        raise ValueError("备注预设最多 200 字")

    existing = db.scalars(select(NotePreset).where(NotePreset.text == cleaned)).one_or_none()
    if existing:
        return existing

    max_order = db.scalar(select(func.coalesce(func.max(NotePreset.sort_order), -1))) or -1
    preset = NotePreset(text=cleaned, sort_order=int(max_order) + 1)
    try:
        with db.begin_nested():
            db.add(preset)
            db.flush()
    except IntegrityError:
        existing = db.scalars(select(NotePreset).where(NotePreset.text == cleaned)).one()
        return existing
    return preset


def delete_note_preset(db: Session, preset_id: UUID) -> None:
    preset = db.get(NotePreset, preset_id)
    if preset is None:
        raise KeyError("备注预设不存在")
    db.delete(preset)
    db.flush()
