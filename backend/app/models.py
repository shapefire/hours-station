import uuid
from datetime import datetime, date, time
from decimal import Decimal
from sqlalchemy import Boolean, Integer, String, Date, Time, Text, DateTime, ForeignKey, UniqueConstraint, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    entries: Mapped[list["WorkEntry"]] = relationship(back_populates="employee")


class WorkEntry(Base):
    __tablename__ = "work_entries"
    __table_args__ = (UniqueConstraint("work_date", "employee_id", name="uq_entry_day_employee"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="on_duty", server_default="on_duty")
    is_external: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_trial: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    ot_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    ot_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    employee: Mapped[Employee] = relationship(back_populates="entries")


class DayNote(Base):
    __tablename__ = "day_notes"
    __table_args__ = (UniqueConstraint("work_date", name="uq_day_notes_work_date"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class NotePreset(Base):
    __tablename__ = "note_presets"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    text: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HoursRuleTier(Base):
    __tablename__ = "hours_rule_tiers"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    min_hours: Mapped[Decimal] = mapped_column(Numeric(4, 1), unique=True, nullable=False)
    deduct_hours: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
