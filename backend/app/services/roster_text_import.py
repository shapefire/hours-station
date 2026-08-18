from datetime import date, time
import re

from sqlalchemy.orm import Session

from app.services.day_notes import put_day_note
from app.services.entries import create_entry, list_entries_by_date, update_entry

TIME_TOKEN = r"(\d{1,2}(?:\.\d)?)"
TIME_RANGE = rf"{TIME_TOKEN}-{TIME_TOKEN}"

_DATE_RE = re.compile(rf"^\s*(\d{{1,2}})\s*月\s*(\d{{1,2}})")
_WEEKDAY_RE = re.compile(r"(?:周[一二三四五六日天]|星期.)")
_TOTAL_RE = re.compile(r"^\s*总\s*[:：]")
_REST_LEAVE_RE = re.compile(r"^(休息|请假)\s*[:：]\s*(.+)$")
_SUPPORT_RE = re.compile(r"^支援([^:：]*)[:：]\s*(.+)$")
_DUTY_RE = re.compile(rf"^{TIME_RANGE}(.+)$")
_OT_RE = re.compile(rf"^([\u4e00-\u9fff]{{2,4}}){TIME_RANGE}\s*$")
_SHIFT_CHANGE_RE = re.compile(rf"[（(]{TIME_RANGE}[）)]\s*$")
_TRAILING_HOURS_RE = re.compile(rf"{TIME_TOKEN}\s*$")
_NOTE_RE = re.compile(r"[（(](.+?)[）)]")
_NAME_SPLIT_RE = re.compile(r"[\s、，]+")
_PERSON_NAME_RE = re.compile(r"^[\u4e00-\u9fffA-Za-z]{2,4}$")
_SUPPORT_BODY_RE = re.compile(rf"^([\u4e00-\u9fffA-Za-z]{{2,4}})\s*(?:{TIME_RANGE})?\s*$")

_STATUS_REST = "rest"
_STATUS_LEAVE = "leave"
_STATUS_SUPPORT = "support"
_STATUS_ON_DUTY = "on_duty"


def parse_time_token(token: str) -> time:
    token = token.strip()
    if "." in token:
        hour_s, frac_s = token.split(".", 1)
        minute = int(round(float(f"0.{frac_s}") * 60))
        if minute == 60:
            return time(int(hour_s) + 1, 0)
        return time(int(hour_s), minute)
    return time(int(token), 0)


def _empty_draft(name: str) -> dict:
    return {
        "name": name,
        "status": None,
        "start_time": None,
        "end_time": None,
        "ot_start_time": None,
        "ot_end_time": None,
        "is_trial": False,
        "note": None,
        "errors": [],
    }


def _get_or_create(entries: dict[str, dict], name: str) -> dict:
    draft = entries.get(name)
    if draft is None:
        draft = _empty_draft(name)
        entries[name] = draft
    return draft


def _parse_duty_payload(rest: str) -> tuple[str, str | None, time | None, time | None] | None:
    rest = rest.strip()
    shift_start = shift_end = None
    shift_m = _SHIFT_CHANGE_RE.search(rest)
    if shift_m:
        shift_start = parse_time_token(shift_m.group(1))
        shift_end = parse_time_token(shift_m.group(2))
        rest = rest[: shift_m.start()].rstrip()
    hours_m = _TRAILING_HOURS_RE.search(rest)
    if hours_m:
        rest = rest[: hours_m.start()].rstrip()
    note = None
    note_m = _NOTE_RE.search(rest)
    if note_m:
        note = note_m.group(1).strip() or None
        rest = f"{rest[: note_m.start()]}{rest[note_m.end():]}".strip()
    name = rest.strip()
    if not _PERSON_NAME_RE.match(name):
        return None
    return name, note, shift_start, shift_end


def _split_names(blob: str) -> list[str]:
    parts = [p.strip() for p in _NAME_SPLIT_RE.split(blob.strip())]
    return [p for p in parts if p]


def _validate_draft(entry: dict) -> None:
    errors: list[str] = []
    start, end = entry["start_time"], entry["end_time"]
    ot_start, ot_end = entry["ot_start_time"], entry["ot_end_time"]
    status = entry["status"]

    main_invalid = start is not None and end is not None and end <= start
    ot_invalid = ot_start is not None and ot_end is not None and ot_end <= ot_start
    if main_invalid or ot_invalid:
        errors.append("invalid_time_range")

    if status == _STATUS_SUPPORT and (start is None or end is None):
        errors.append("missing_support_times")
    elif status == _STATUS_ON_DUTY and (start is None or end is None):
        errors.append("missing_duty_times")

    entry["errors"] = errors


def _flush_day(days: list, current: dict | None, entries: dict[str, dict] | None) -> None:
    if current is None or entries is None:
        return
    current["entries"] = list(entries.values())
    for entry in current["entries"]:
        _validate_draft(entry)
    days.append(current)


def parse_roster_text(text: str, *, year: int) -> dict:
    days: list[dict] = []
    unparsed_lines: list[str] = []
    current: dict | None = None
    entries: dict[str, dict] | None = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if _TOTAL_RE.match(line):
            continue

        date_m = _DATE_RE.match(line)
        if date_m:
            _flush_day(days, current, entries)
            month, day_n = int(date_m.group(1)), int(date_m.group(2))
            try:
                work_date = date(year, month, day_n)
            except ValueError:
                current = None
                entries = None
                unparsed_lines.append(line)
                continue
            remainder = _WEEKDAY_RE.sub("", line[date_m.end() :])
            day_note = remainder.strip() or None
            current = {
                "work_date": work_date,
                "day_note": day_note,
                "entries": [],
                "errors": [],
            }
            entries = {}
            continue

        if current is None or entries is None:
            unparsed_lines.append(line)
            continue

        rest_leave_m = _REST_LEAVE_RE.match(line)
        if rest_leave_m:
            status = _STATUS_REST if rest_leave_m.group(1) == "休息" else _STATUS_LEAVE
            for name in _split_names(rest_leave_m.group(2)):
                draft = _get_or_create(entries, name)
                draft["status"] = status
                draft["start_time"] = None
                draft["end_time"] = None
                draft["is_trial"] = False
            continue

        support_m = _SUPPORT_RE.match(line)
        if support_m:
            location = support_m.group(1).strip() or None
            body_m = _SUPPORT_BODY_RE.match(support_m.group(2).strip())
            if body_m is None:
                unparsed_lines.append(line)
                continue
            name = body_m.group(1)
            draft = _get_or_create(entries, name)
            draft["status"] = _STATUS_SUPPORT
            draft["note"] = location
            draft["is_trial"] = False
            if body_m.group(2) and body_m.group(3):
                draft["start_time"] = parse_time_token(body_m.group(2))
                draft["end_time"] = parse_time_token(body_m.group(3))
            else:
                draft["start_time"] = None
                draft["end_time"] = None
            continue

        duty_m = _DUTY_RE.match(line)
        if duty_m:
            parsed = _parse_duty_payload(duty_m.group(3))
            if parsed is None:
                unparsed_lines.append(line)
                continue
            name, note, shift_start, shift_end = parsed
            start = shift_start if shift_start is not None else parse_time_token(duty_m.group(1))
            end = shift_end if shift_end is not None else parse_time_token(duty_m.group(2))
            draft = _get_or_create(entries, name)
            draft["status"] = _STATUS_ON_DUTY
            draft["start_time"] = start
            draft["end_time"] = end
            draft["note"] = note
            draft["is_trial"] = "试工" in (note or "")
            continue

        ot_m = _OT_RE.match(line)
        if ot_m:
            name = ot_m.group(1)
            draft = _get_or_create(entries, name)
            if draft["status"] is None:
                draft["status"] = _STATUS_ON_DUTY
            draft["ot_start_time"] = parse_time_token(ot_m.group(2))
            draft["ot_end_time"] = parse_time_token(ot_m.group(3))
            continue

        unparsed_lines.append(line)

    _flush_day(days, current, entries)
    return {"days": days, "unparsed_lines": unparsed_lines}


def preview_roster_import(text: str, *, year: int) -> dict:
    return parse_roster_text(text, year=year)


def commit_roster_import(db: Session, days: list[dict]) -> dict:
    created = 0
    updated = 0
    day_notes_upserted = 0

    for day in days:
        work_date = day["work_date"]
        existing_by_name = {
            entry.employee.name: entry for entry in list_entries_by_date(db, work_date)
        }
        for draft in day["entries"]:
            name = draft["name"]
            status = draft["status"]
            fields = {
                "status": status,
                "is_trial": draft.get("is_trial", False),
                "note": draft.get("note"),
                "ot_start_time": draft.get("ot_start_time"),
                "ot_end_time": draft.get("ot_end_time"),
            }
            if status not in ("rest", "leave"):
                fields["start_time"] = draft.get("start_time")
                fields["end_time"] = draft.get("end_time")

            existing = existing_by_name.get(name)
            if existing is not None:
                updated_entry = update_entry(db, existing.id, fields)
                existing_by_name[name] = updated_entry
                updated += 1
            else:
                created_entry = create_entry(
                    db,
                    work_date=work_date,
                    name=name,
                    status=status,
                    is_trial=fields["is_trial"],
                    start_time=draft.get("start_time"),
                    end_time=draft.get("end_time"),
                    note=fields["note"],
                    ot_start_time=fields["ot_start_time"],
                    ot_end_time=fields["ot_end_time"],
                )
                existing_by_name[name] = created_entry
                created += 1

        day_note = day.get("day_note")
        if day_note is not None:
            put_day_note(db, work_date, day_note)
            day_notes_upserted += 1

    return {
        "created": created,
        "updated": updated,
        "day_notes_upserted": day_notes_upserted,
    }
