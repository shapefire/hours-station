from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import HoursRuleTier, NotePreset, StoreSettings
from app.services.hours_rule_cache import get_cached_tiers, set_cached_tiers

DEFAULT_STORE_NAME = "东圃地铁站"
STORE_SETTINGS_ID = 1
MAX_STORE_NAME_LEN = 64


def _format_one_decimal(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.1'))}"


def _parse_tier_hours(raw: str, *, field: str) -> Decimal:
    try:
        value = Decimal(str(raw))
    except Exception as exc:
        raise ValueError(f"{field} 格式无效") from exc
    if value != value.quantize(Decimal("0.1")):
        quantized = value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        if value != quantized and value.as_tuple().exponent < -1:
            raise ValueError(f"{field} 最多一位小数")
    return value.quantize(Decimal("0.1"))


def validate_tiers_payload(tiers: list) -> list[tuple[Decimal, Decimal]]:
    if len(tiers) != 1:
        raise ValueError("当前仅支持一条工时规则")
    parsed: list[tuple[Decimal, Decimal]] = []
    for item in tiers:
        min_hours = _parse_tier_hours(
            item.min_hours if hasattr(item, "min_hours") else item["min_hours"],
            field="满多少小时",
        )
        deduct = _parse_tier_hours(
            item.deduct_hours if hasattr(item, "deduct_hours") else item["deduct_hours"],
            field="扣减小时",
        )
        if min_hours <= 0 or min_hours > Decimal("24"):
            raise ValueError("满多少小时须在 0 到 24 之间（不含 0）")
        if deduct < 0 or deduct > min_hours:
            raise ValueError("扣减小时须在 0 到满多少小时之间")
        parsed.append((min_hours, deduct))
    return parsed


def _hours_rule_dict(tiers: list[tuple[Decimal, Decimal]]) -> dict:
    return {
        "tiers": [
            {"min_hours": _format_one_decimal(m), "deduct_hours": _format_one_decimal(d)}
            for m, d in tiers
        ]
    }


def get_hours_rule() -> dict:
    return _hours_rule_dict(get_cached_tiers())


def replace_hours_rule(db: Session, tiers_in: list) -> dict:
    parsed = validate_tiers_payload(tiers_in)
    db.execute(delete(HoursRuleTier))
    for index, (min_hours, deduct) in enumerate(parsed):
        db.add(HoursRuleTier(min_hours=min_hours, deduct_hours=deduct, sort_order=index))
    db.flush()
    db.commit()
    set_cached_tiers(parsed)
    return _hours_rule_dict(parsed)


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


def get_store_name(db: Session) -> str:
    row = db.get(StoreSettings, STORE_SETTINGS_ID)
    if row is None:
        row = StoreSettings(id=STORE_SETTINGS_ID, store_name=DEFAULT_STORE_NAME)
        db.add(row)
        db.flush()
    return row.store_name


def put_store_name(db: Session, name: str) -> str:
    cleaned = (name or "").strip()
    if not cleaned:
        raise ValueError("店名不能为空")
    if len(cleaned) > MAX_STORE_NAME_LEN:
        raise ValueError("店名最长 64 字")
    row = db.get(StoreSettings, STORE_SETTINGS_ID)
    if row is None:
        row = StoreSettings(id=STORE_SETTINGS_ID, store_name=cleaned)
        db.add(row)
    else:
        row.store_name = cleaned
    db.flush()
    return row.store_name
