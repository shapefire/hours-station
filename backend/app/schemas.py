from datetime import date, time
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class EntryCreate(BaseModel):
    work_date: date
    name: str
    start_time: time
    end_time: time
    note: str | None = None


class EntryUpdate(BaseModel):
    work_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    note: str | None = None


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
