SKIP_DEDUCTION_NOTE = "没吃饭不扣减"
LEGACY_SKIP_DEDUCTION_NOTES = ("未休息不扣减",)


def apply_skip_deduction_note(note: str | None, skip: bool) -> str | None:
    drop = {SKIP_DEDUCTION_NOTE, *LEGACY_SKIP_DEDUCTION_NOTES}
    parts = [p.strip() for p in str(note or "").split("、") if p.strip()]
    parts = [p for p in parts if p not in drop]
    if skip:
        parts.append(SKIP_DEDUCTION_NOTE)
    if not parts:
        return None
    return "、".join(parts)
