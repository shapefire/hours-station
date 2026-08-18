SKIP_DEDUCTION_NOTE = "未休息不扣减"


def apply_skip_deduction_note(note: str | None, skip: bool) -> str | None:
    parts = [p.strip() for p in str(note or "").split("、") if p.strip()]
    parts = [p for p in parts if p != SKIP_DEDUCTION_NOTE]
    if skip:
        parts.append(SKIP_DEDUCTION_NOTE)
    if not parts:
        return None
    return "、".join(parts)
