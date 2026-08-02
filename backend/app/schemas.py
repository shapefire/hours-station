from datetime import date, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class EntryCreate(BaseModel):
    work_date: date
    name: str = Field(..., min_length=1, max_length=64)
    start_time: time
    end_time: time
    note: str | None = None


class EntryUpdate(BaseModel):
    work_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    note: str | None = None


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
    start_time: time
    end_time: time
    note: str | None
    effective_hours: str

    @field_serializer("start_time", "end_time")
    def serialize_time(self, value: time) -> str:
        return value.strftime("%H:%M")


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str = Field(..., max_length=64)


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
    status: Literal["work", "rest"]
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
