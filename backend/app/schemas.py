from datetime import date, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer

EntryStatus = Literal["on_duty", "rest", "leave", "support"]


class EntryCreate(BaseModel):
    work_date: date
    name: str = Field(..., min_length=1, max_length=64)
    status: EntryStatus = "on_duty"
    is_external: bool = False
    is_trial: bool = False
    start_time: time | None = None
    end_time: time | None = None
    ot_start_time: time | None = None
    ot_end_time: time | None = None
    note: str | None = None
    # 状态与时段/标识组合校验在 entries 服务层，保证 ValueError → 400（非 Pydantic 422）


class EntryUpdate(BaseModel):
    work_date: date | None = None
    status: EntryStatus | None = None
    is_external: bool | None = None
    is_trial: bool | None = None
    start_time: time | None = None
    end_time: time | None = None
    ot_start_time: time | None = None
    ot_end_time: time | None = None
    note: str | None = None
    clear_times: bool = False  # 若改为 rest/leave，服务层清空时段；不清加班段


class CopyDayIn(BaseModel):
    from_date: date
    to_date: date


class CopyDayOut(BaseModel):
    copied: int
    skipped: int
    skipped_names: list[str]


class CopyPersonIn(BaseModel):
    source_entry_id: UUID
    name: str = Field(..., min_length=1, max_length=64)
    date: date


class EntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    work_date: date
    employee_id: UUID
    employee_name: str
    status: EntryStatus
    is_external: bool
    is_trial: bool
    start_time: time | None
    end_time: time | None
    ot_start_time: time | None
    ot_end_time: time | None
    note: str | None
    effective_hours: str

    @field_serializer("start_time", "end_time", "ot_start_time", "ot_end_time")
    def serialize_time(self, value: time | None) -> str | None:
        if value is None:
            return None
        return value.strftime("%H:%M")


class EmployeeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)


class EmployeeImportIn(BaseModel):
    text: str


class EmployeeImportOut(BaseModel):
    created: int
    reactivated: int
    skipped_existing: int
    skipped_invalid: int
    names: list[str]


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str = Field(..., max_length=64)
    month_hours: str | None = None
    month_rest_days: int | None = None


class CalendarDayOut(BaseModel):
    date: date
    entry_count: int
    total_effective_hours: str


class CalendarMonthOut(BaseModel):
    year: int
    month: int
    registered_days: int
    month_total_hours: str
    days: list[CalendarDayOut]


class StatsPersonOut(BaseModel):
    employee_id: UUID
    name: str
    attendance_days: int
    rest_days: int
    support_days: int
    support_hours: str
    total_hours: str
    avg_hours: str | None


class StatsMonthlyOut(BaseModel):
    year: int
    month: int
    total_hours: str
    employee_count: int
    attendance_person_days: int
    people: list[StatsPersonOut]


class StatsDayOut(BaseModel):
    date: date
    status: Literal["work", "rest", "leave", "support"]
    start_time: time | None
    end_time: time | None
    effective_hours: str | None

    @field_serializer("start_time", "end_time")
    def serialize_time(self, value: time | None) -> str | None:
        if value is None:
            return None
        return value.strftime("%H:%M")


class StatsEmployeeDaysOut(BaseModel):
    days: list[StatsDayOut]


class NotePresetCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=200)


class NotePresetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    text: str = Field(..., max_length=200)
    sort_order: int


class HoursRuleTierPayload(BaseModel):
    min_hours: str
    deduct_hours: str


class HoursRuleIn(BaseModel):
    tiers: list[HoursRuleTierPayload]


class HoursRuleOut(BaseModel):
    tiers: list[HoursRuleTierPayload]


class DayNotePut(BaseModel):
    note: str


class DayNoteOut(BaseModel):
    work_date: date
    note: str | None


class RosterImportPreviewIn(BaseModel):
    text: str
    year: int


class RosterImportPreviewEntry(BaseModel):
    name: str
    status: EntryStatus | None = None
    start_time: time | None = None
    end_time: time | None = None
    ot_start_time: time | None = None
    ot_end_time: time | None = None
    is_trial: bool = False
    note: str | None = None
    errors: list[str] = Field(default_factory=list)

    @field_serializer("start_time", "end_time", "ot_start_time", "ot_end_time")
    def serialize_time(self, value: time | None) -> str | None:
        if value is None:
            return None
        return value.strftime("%H:%M")


class RosterImportPreviewDay(BaseModel):
    work_date: date
    day_note: str | None = None
    entries: list[RosterImportPreviewEntry]
    errors: list[str] = Field(default_factory=list)


class RosterImportPreviewOut(BaseModel):
    days: list[RosterImportPreviewDay]
    unparsed_lines: list[str] = Field(default_factory=list)


class RosterImportCommitEntry(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    status: EntryStatus
    start_time: time | None = None
    end_time: time | None = None
    ot_start_time: time | None = None
    ot_end_time: time | None = None
    is_trial: bool = False
    note: str | None = None


class RosterImportCommitDay(BaseModel):
    work_date: date
    day_note: str | None = None
    entries: list[RosterImportCommitEntry]


class RosterImportCommitIn(BaseModel):
    days: list[RosterImportCommitDay]


class RosterImportCommitOut(BaseModel):
    created: int
    updated: int
    day_notes_upserted: int
