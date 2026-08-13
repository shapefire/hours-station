# 日明细状态（休息/请假/支援/试工）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在工作日历右侧日明细支持休息/请假多选、到岗外援与试工标识、外派支援（计时段但不计入本店工时），并同步月历合计与统计口径。

**Architecture:** 扩展现有 `work_entries`（`status` / `is_external` / `is_trial`，休息请假时段可空），同日同人唯一约束天然互斥；日历与本店合计只汇总 `on_duty`；统计按「出勤 / 支援 / 休息天数 = 当月 − 出勤 − 支援」计算；前端 DayPanel 分段渲染。

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic + pytest；React + Vite（无前端单测，用手测 + `npm run build`）。

**Spec:** `docs/superpowers/specs/2026-08-14-day-panel-status-design.md`

## Global Constraints

- `status ∈ {on_duty, rest, leave, support}`；默认 `on_duty`
- 同日同人唯一（四种状态互斥）
- `on_duty` / `support`：时段必填且 `end > start`；`rest` / `leave`：时段必须为 null
- 外援/试工仅 `on_duty` 可 true；默认可 false；可同时 true
- 本店总工时 / 月历格人数与工时：**仅** `on_duty`（含外援、试工）
- `support` 返回展示用 `effective_hours`，但不计入本店合计
- 休息天数 = 当月天数 − 出勤天数 − 支援天数
- 逐日 stats：`work`（on_duty）/ `rest` / `leave` / `support`；无记录仍为 `rest`
- 提交说明使用中文简述；未获用户明确要求时执行阶段可不 commit（以用户指令为准）

## File Structure

```
backend/
  alembic/versions/005_work_entry_status.py   # 新列 + 可空时段
  app/models.py                               # WorkEntry 字段
  app/schemas.py                              # Entry*/Stats* 扩展
  app/services/entries.py                     # 校验、序列化、CRUD、复制
  app/services/stats.py                       # 出勤/支援/休息口径
  app/services/employees.py                   # month_hours 仅 on_duty
  app/routers/calendar.py                     # 日格仅 on_duty
  app/routers/entries.py                      # 如需透传新字段（多半已自动）
  tests/test_entries_api.py                   # 状态/互斥/标识
  tests/test_calendar_api.py                  # 排除支援
  tests/test_stats_api.py                     # 休息/支援列
  tests/test_copy_api.py                      # 复制保留状态与标识
frontend/
  src/components/EntryForm.jsx                # 外援/试工勾选
  src/components/DayPanel.jsx                 # 分段列表 + 休息请假多选 + 支援
  src/components/StatusMultiPick.jsx          # 新建：休息/请假多选弹层
  src/components/SupportForm.jsx              # 新建：支援表单（或内联 DayPanel）
  src/pages/CalendarPage.jsx                  # 提交字段、分区操作
  src/utils/dayPreviewText.js                 # 分区预览文案
  src/components/DayPreviewModal.jsx          # 合计仅到岗
  src/components/StatsPeopleTable.jsx         # 支援列 + 逐日状态展示
  src/styles/global.css                       # 徽章、分区、chip、支援虚线卡
```

---

### Task 1: DB 迁移 + WorkEntry 模型

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/005_work_entry_status.py`

**Interfaces:**
- Produces: `WorkEntry.status: str`；`is_external: bool`；`is_trial: bool`；`start_time` / `end_time` 可空

- [ ] **Step 1: 扩展 `WorkEntry` 模型**

在 `backend/app/models.py` 的 `WorkEntry` 中改为：

```python
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
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    employee: Mapped[Employee] = relationship(back_populates="entries")
```

- [ ] **Step 2: 写迁移 `005_work_entry_status.py`**

```python
"""work entry status flags and nullable times

Revision ID: 005_work_entry_status
Revises: 004_hours_rule_tiers
Create Date: 2026-08-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005_work_entry_status"
down_revision: Union[str, Sequence[str], None] = "004_hours_rule_tiers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "work_entries",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="on_duty"),
    )
    op.add_column(
        "work_entries",
        sa.Column("is_external", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "work_entries",
        sa.Column("is_trial", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.alter_column("work_entries", "start_time", existing_type=sa.Time(), nullable=True)
    op.alter_column("work_entries", "end_time", existing_type=sa.Time(), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE work_entries SET start_time = '00:00' WHERE start_time IS NULL")
    op.execute("UPDATE work_entries SET end_time = '00:01' WHERE end_time IS NULL")
    op.alter_column("work_entries", "end_time", existing_type=sa.Time(), nullable=False)
    op.alter_column("work_entries", "start_time", existing_type=sa.Time(), nullable=False)
    op.drop_column("work_entries", "is_trial")
    op.drop_column("work_entries", "is_external")
    op.drop_column("work_entries", "status")
```

- [ ] **Step 3: 跑迁移（测试库由 conftest 自动 upgrade；本地可）**

Run: `cd backend && python -c "from app.migrate import run_alembic_upgrade; run_alembic_upgrade()"`  
（若项目惯用 `alembic upgrade head`，等价即可。）

Expected: 无报错；`work_entries` 含新列。

- [ ] **Step 4: Commit（仅当用户要求提交时执行）**

```bash
git add backend/app/models.py backend/alembic/versions/005_work_entry_status.py
git commit -m "扩展工时条目状态字段以支持休息请假与支援"
```

---

### Task 2: Schema + entries 服务校验与序列化

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/entries.py`
- Test: `backend/tests/test_entries_api.py`

**Interfaces:**
- Consumes: `WorkEntry.status/is_external/is_trial`；可空时段
- Produces:
  - `EntryCreate` / `EntryUpdate` / `EntryOut` 含 `status`, `is_external`, `is_trial`；时段可选
  - `create_entry(..., status="on_duty", is_external=False, is_trial=False, start_time=None, end_time=None)`
  - `entry_to_dict` 对 rest/leave 返回 `effective_hours="0.0"` 且 times 可为 null（Out 序列化为 null）
  - 非法组合抛 `ValueError`；冲突抛 `LookupError`（文案含已占用状态中文）

- [ ] **Step 1: 写失败测试（休息无时段、外援标识、互斥）**

在 `backend/tests/test_entries_api.py` 追加：

```python
def test_create_rest_entry_without_times(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "赵六",
        "status": "rest",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "rest"
    assert body["start_time"] is None
    assert body["end_time"] is None
    assert body["effective_hours"] == "0.0"
    assert body["is_external"] is False
    assert body["is_trial"] is False


def test_create_on_duty_with_external_and_trial(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "外援甲",
        "start_time": "08:00",
        "end_time": "17:00",
        "status": "on_duty",
        "is_external": True,
        "is_trial": True,
        "note": "城南店",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["is_external"] is True
    assert body["is_trial"] is True
    assert body["effective_hours"] == "8.5"


def test_rest_then_on_duty_same_day_conflict(client):
    assert client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "张三",
        "status": "rest",
    }).status_code == 201
    r = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    assert r.status_code in (400, 409)
    assert "休息" in r.json()["detail"]


def test_leave_rejects_times(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "孙八",
        "status": "leave",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    assert r.status_code == 400


def test_create_support_hours_returned_but_flags_forbidden(client):
    ok = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "周九",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
    })
    assert ok.status_code == 201
    assert ok.json()["effective_hours"] == "8.5"
    bad = client.post("/api/entries", json={
        "work_date": "2026-08-15",
        "name": "周九",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
        "is_trial": True,
    })
    assert bad.status_code == 400
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && pytest tests/test_entries_api.py::test_create_rest_entry_without_times tests/test_entries_api.py::test_create_on_duty_with_external_and_trial -v`  
Expected: FAIL（字段/校验尚未实现）

- [ ] **Step 3: 更新 schemas**

替换/扩展 `backend/app/schemas.py` 中条目相关模型：

```python
from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

EntryStatus = Literal["on_duty", "rest", "leave", "support"]


class EntryCreate(BaseModel):
    work_date: date
    name: str = Field(..., min_length=1, max_length=64)
    status: EntryStatus = "on_duty"
    is_external: bool = False
    is_trial: bool = False
    start_time: time | None = None
    end_time: time | None = None
    note: str | None = None

    @model_validator(mode="after")
    def validate_status_fields(self):
        if self.status in ("on_duty", "support"):
            if self.start_time is None or self.end_time is None:
                raise ValueError("到岗/支援必须填写开始与结束时间")
        if self.status in ("rest", "leave"):
            if self.start_time is not None or self.end_time is not None:
                raise ValueError("休息/请假不能填写时段")
            if self.is_external or self.is_trial:
                raise ValueError("休息/请假不能标记外援或试工")
        if self.status == "support" and (self.is_external or self.is_trial):
            raise ValueError("支援不能标记外援或试工")
        if self.status != "on_duty" and (self.is_external or self.is_trial):
            raise ValueError("仅到岗可标记外援或试工")
        return self


class EntryUpdate(BaseModel):
    work_date: date | None = None
    status: EntryStatus | None = None
    is_external: bool | None = None
    is_trial: bool | None = None
    start_time: time | None = None
    end_time: time | None = None
    note: str | None = None
    clear_times: bool = False  # 若改为 rest/leave，服务层清空时段


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
    note: str | None
    effective_hours: str

    @field_serializer("start_time", "end_time")
    def serialize_time(self, value: time | None) -> str | None:
        if value is None:
            return None
        return value.strftime("%H:%M")
```

（`EntryUpdate` 的组合校验放服务层，合并后再校验，避免部分 PATCH 误杀。）

- [ ] **Step 4: 重写 `entries.py` 核心辅助函数**

```python
STATUS_LABEL = {
    "on_duty": "到岗",
    "rest": "休息",
    "leave": "请假",
    "support": "支援",
}


def _normalize_entry_fields(
    *,
    status: str,
    is_external: bool,
    is_trial: bool,
    start_time: time | None,
    end_time: time | None,
) -> tuple[str, bool, bool, time | None, time | None]:
    if status not in STATUS_LABEL:
        raise ValueError("无效状态")
    if status in ("rest", "leave"):
        if start_time is not None or end_time is not None:
            raise ValueError("休息/请假不能填写时段")
        if is_external or is_trial:
            raise ValueError("休息/请假不能标记外援或试工")
        return status, False, False, None, None
    if status == "support":
        if start_time is None or end_time is None:
            raise ValueError("支援必须填写开始与结束时间")
        if is_external or is_trial:
            raise ValueError("支援不能标记外援或试工")
        format_effective_hours(start_time, end_time)
        return status, False, False, start_time, end_time
    # on_duty
    if start_time is None or end_time is None:
        raise ValueError("到岗必须填写开始与结束时间")
    format_effective_hours(start_time, end_time)
    return status, bool(is_external), bool(is_trial), start_time, end_time


def format_entry_hours(entry: WorkEntry) -> str:
    if entry.status in ("rest", "leave") or entry.start_time is None or entry.end_time is None:
        return "0.0"
    return format_effective_hours(entry.start_time, entry.end_time)


def entry_to_dict(entry: WorkEntry) -> dict:
    return {
        "id": entry.id,
        "work_date": entry.work_date,
        "employee_id": entry.employee_id,
        "employee_name": entry.employee.name,
        "status": entry.status,
        "is_external": entry.is_external,
        "is_trial": entry.is_trial,
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "note": entry.note,
        "effective_hours": format_entry_hours(entry),
    }
```

将 `_ensure_unique_day_employee` 冲突文案改为读取已有行 status：

```python
existing = db.scalars(stmt).one_or_none()
if existing is not None:
    label = STATUS_LABEL.get(existing.status, existing.status)
    raise LookupError(f"该员工当日已在{label}")
```

`create_entry` 增加参数并写入新字段；`list_entries_by_date` 排序改为  
`order_by(WorkEntry.status, WorkEntry.start_time.nulls_last(), WorkEntry.id)`（若 DB/方言对 `nulls_last` 不便，可 Python 排序）。

`update_entry`：合并 status/flags/times 后调用 `_normalize_entry_fields`；切到 rest/leave 时强制 times=None。

- [ ] **Step 5: 路由器透传新字段**

确认 `backend/app/routers/entries.py` 的 `create_entry` / `patch_entry` 把 `status`、`is_external`、`is_trial` 传入服务；`ValueError` → 400（若现有只映射部分异常，补上）。

- [ ] **Step 6: 跑测试通过**

Run: `cd backend && pytest tests/test_entries_api.py -v`  
Expected: PASS（含旧用例；旧 POST 不传 status 时默认 on_duty）

- [ ] **Step 7: Commit（可选）**

```bash
git add backend/app/schemas.py backend/app/services/entries.py backend/app/routers/entries.py backend/tests/test_entries_api.py
git commit -m "实现条目状态校验与休息请假支援登记 API"
```

---

### Task 3: 日历与花名册月工时仅统计到岗

**Files:**
- Modify: `backend/app/routers/calendar.py`
- Modify: `backend/app/services/employees.py`
- Test: `backend/tests/test_calendar_api.py`

**Interfaces:**
- Consumes: `WorkEntry.status`
- Produces: `entry_count` / `total_effective_hours` / `month_total_hours` / `month_hours` 仅累加 `status == "on_duty"`

- [ ] **Step 1: 写失败测试**

在 `test_calendar_api.py` 追加：

```python
def test_calendar_excludes_support_and_rest_from_totals(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "周九",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "赵六",
        "status": "rest",
    })
    r = client.get("/api/calendar", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    day = next(d for d in r.json()["days"] if d["date"] == "2026-08-14")
    assert day["entry_count"] == 1
    assert day["total_effective_hours"] == "8.0"
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd backend && pytest tests/test_calendar_api.py::test_calendar_excludes_support_and_rest_from_totals -v`  
Expected: FAIL（当前会把支援算进去）

- [ ] **Step 3: 修改 calendar 聚合**

```python
for work_date in sorted(by_date):
    day_entries = [e for e in by_date[work_date] if e.status == "on_duty"]
    if not day_entries:
        continue
    day_total = sum(
        (effective_hours(e.start_time, e.end_time) for e in day_entries),
        Decimal("0"),
    )
    ...
```

注意：仅有休息/支援的日期 **不要** 出现在 `days` 里（或 `entry_count=0` 且不计入 `registered_days`）。与现逻辑「有条目才出现」对齐时：若过滤后为空则 `continue`，该日不进 `registered_days`。

- [ ] **Step 4: `employees._month_hours_by_employee` 只加 on_duty**

```python
for entry in entries:
    if entry.status != "on_duty":
        continue
    if entry.start_time is None or entry.end_time is None:
        continue
    hours = effective_hours(entry.start_time, entry.end_time)
    ...
```

- [ ] **Step 5: 跑日历相关测试**

Run: `cd backend && pytest tests/test_calendar_api.py -v`  
Expected: PASS

---

### Task 4: 统计口径（出勤 / 支援 / 休息）

**Files:**
- Modify: `backend/app/schemas.py`（`StatsPersonOut`, `StatsDayOut`）
- Modify: `backend/app/services/stats.py`
- Test: `backend/tests/test_stats_api.py`

**Interfaces:**
- Produces: `StatsPersonOut.support_days: int`；`support_hours: str`；`rest_days = days_in_month - attendance_days - support_days`
- `StatsDayOut.status: Literal["work","rest","leave","support"]`；leave/support 带对应字段
- 本店 `total_hours` / 人 `total_hours` **仅 on_duty**

- [ ] **Step 1: 写失败测试**

```python
def test_monthly_stats_support_not_in_store_hours_or_rest(client):
    # Aug 2026 has 31 days
    client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-02",
        "name": "张三",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-03",
        "name": "张三",
        "status": "leave",
    })
    r = client.get("/api/stats/monthly", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    body = r.json()
    assert body["total_hours"] == "8.0"
    person = body["people"][0]
    assert person["attendance_days"] == 1
    assert person["support_days"] == 1
    assert person["support_hours"] == "8.5"
    assert person["rest_days"] == 29  # 31 - 1 - 1
    assert person["total_hours"] == "8.0"

    days = client.get(
        f"/api/stats/monthly/{person['employee_id']}/days",
        params={"year": 2026, "month": 8},
    ).json()["days"]
    by = {d["date"]: d for d in days}
    assert by["2026-08-01"]["status"] == "work"
    assert by["2026-08-02"]["status"] == "support"
    assert by["2026-08-03"]["status"] == "leave"
    assert by["2026-08-04"]["status"] == "rest"
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd backend && pytest tests/test_stats_api.py::test_monthly_stats_support_not_in_store_hours_or_rest -v`  
Expected: FAIL

- [ ] **Step 3: 更新 schema**

```python
class StatsPersonOut(BaseModel):
    employee_id: UUID
    name: str
    attendance_days: int
    rest_days: int
    support_days: int
    support_hours: str
    total_hours: str
    avg_hours: str | None


class StatsDayOut(BaseModel):
    date: date
    status: Literal["work", "rest", "leave", "support"]
    start_time: time | None
    end_time: time | None
    effective_hours: str | None
    # serializers unchanged
```

- [ ] **Step 4: 重写 `monthly_stats` / `employee_month_days` 聚合**

对每人：

```python
attendance_days = len({e.work_date for e in emp_entries if e.status == "on_duty"})
support_entries = [e for e in emp_entries if e.status == "support"]
support_days = len({e.work_date for e in support_entries})
support_total = sum(
    (effective_hours(e.start_time, e.end_time) for e in support_entries),
    Decimal("0"),
)
duty_entries = [e for e in emp_entries if e.status == "on_duty"]
total = sum((effective_hours(e.start_time, e.end_time) for e in duty_entries), Decimal("0"))
rest_days = days_in_month - attendance_days - support_days
avg_hours = _format_hours(total / attendance_days) if attendance_days else None
```

逐日映射：

```python
status_map = {"on_duty": "work", "rest": "rest", "leave": "leave", "support": "support"}
...
st = status_map[entry.status]
hours = None
if entry.status in ("on_duty", "support"):
    hours = _format_hours(effective_hours(entry.start_time, entry.end_time))
days.append({
    "date": day,
    "status": st,
    "start_time": entry.start_time,
    "end_time": entry.end_time,
    "effective_hours": hours,
})
```

更新既有 `test_monthly_stats_summary_and_rest_days`：断言补上 `support_days == 0`、`support_hours == "0.0"`（按实际旧场景）。

- [ ] **Step 5: 跑统计测试**

Run: `cd backend && pytest tests/test_stats_api.py -v`  
Expected: PASS

---

### Task 5: 复制保留状态与标识

**Files:**
- Modify: `backend/app/services/entries.py`（`copy_day`, `copy_person`）
- Modify: `backend/app/schemas.py`（`CopyPersonIn` 可选覆盖字段，若草稿需要）
- Test: `backend/tests/test_copy_api.py`

**Interfaces:**
- `copy_day` 复制 `status/is_external/is_trial/start/end/note`
- `copy_person` 基于源条目创建同 status；若源为 rest/leave则无时段；冲突跳过语义不变

- [ ] **Step 1: 写测试**

```python
def test_copy_day_preserves_status_flags(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-10",
        "name": "李四",
        "start_time": "08:00",
        "end_time": "17:00",
        "is_external": True,
        "is_trial": True,
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-10",
        "name": "赵六",
        "status": "rest",
    })
    r = client.post("/api/entries/copy-day", json={
        "from_date": "2026-08-10",
        "to_date": "2026-08-11",
    })
    assert r.status_code == 200
    assert r.json()["copied"] == 2
    rows = client.get("/api/entries", params={"date": "2026-08-11"}).json()
    by = {x["employee_name"]: x for x in rows}
    assert by["李四"]["is_external"] is True
    assert by["李四"]["is_trial"] is True
    assert by["赵六"]["status"] == "rest"
```

- [ ] **Step 2: 实现 `copy_day` 写入新字段；`copy_person` 走带 status 的 `create_entry`**

```python
entry = WorkEntry(
    work_date=to_date,
    employee_id=source.employee_id,
    status=source.status,
    is_external=source.is_external,
    is_trial=source.is_trial,
    start_time=source.start_time,
    end_time=source.end_time,
    note=source.note,
)
```

`copy_person`：

```python
return create_entry(
    db,
    work_date=work_date,
    name=name,
    status=source.status,
    is_external=source.is_external,
    is_trial=source.is_trial,
    start_time=source.start_time,
    end_time=source.end_time,
    note=source.note,
)
```

若快速复制草稿允许改时段，保持现有 router 用请求体覆盖——本 Task 先保证源字段默认带上；前端草稿在 Task 7 传 `is_external`/`is_trial`/`status`。

- [ ] **Step 3: 跑复制测试**

Run: `cd backend && pytest tests/test_copy_api.py -v`  
Expected: PASS

---

### Task 6: 前端 EntryForm — 外援 / 试工

**Files:**
- Modify: `frontend/src/components/EntryForm.jsx`
- Modify: `frontend/src/pages/CalendarPage.jsx`（提交字段）
- Modify: `frontend/src/styles/global.css`（勾选行样式）

**Interfaces:**
- `onSubmit` payload 增加 `is_external: boolean`、`is_trial: boolean`、`status: 'on_duty'`（到岗表单固定）

- [ ] **Step 1: 扩展 `EMPTY` / `entryToForm` / 勾选 UI**

```javascript
const EMPTY = {
  name: '',
  start_time: '07:30',
  end_time: '16:00',
  note: '',
  is_external: false,
  is_trial: false,
}

function entryToForm(entry) {
  if (!entry) return { ...EMPTY }
  return {
    name: entry.employee_name || '',
    start_time: entry.start_time || '07:30',
    end_time: entry.end_time || '16:00',
    note: entry.note || '',
    is_external: !!entry.is_external,
    is_trial: !!entry.is_trial,
  }
}
```

在备注下方增加：

```jsx
<div className="entry-form__checks">
  <label>
    <input
      type="checkbox"
      checked={form.is_external}
      onChange={(e) => updateField('is_external', e.target.checked)}
      disabled={busy}
    />
    外援
  </label>
  <label>
    <input
      type="checkbox"
      checked={form.is_trial}
      onChange={(e) => updateField('is_trial', e.target.checked)}
      disabled={busy}
    />
    试工
  </label>
</div>
```

submit payload 带上两字段与 `status: 'on_duty'`。

- [ ] **Step 2: `CalendarPage.handleFormSubmit` POST/PATCH 传新字段**

```javascript
await api.post('/api/entries', {
  work_date: selectedDate,
  name: payload.name,
  start_time: payload.start_time,
  end_time: payload.end_time,
  note: payload.note,
  status: 'on_duty',
  is_external: !!payload.is_external,
  is_trial: !!payload.is_trial,
})
// patch 同理带 is_external / is_trial / 时段
```

- [ ] **Step 3: 手测** — 新增到岗勾选外援+试工，刷新后列表仍在（列表徽章在 Task 7）。

---

### Task 7: DayPanel 分段 UI（休息/请假/支援）

**Files:**
- Create: `frontend/src/components/StatusMultiPick.jsx`
- Modify: `frontend/src/components/DayPanel.jsx`
- Modify: `frontend/src/pages/CalendarPage.jsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- DayPanel 接收 `entries`，内部分组：
  - `duty = entries.filter(e => e.status === 'on_duty' || !e.status)`
  - `rest/leave/support` 同理
- 回调：`onAddRestLeave(status, names[])`、`onRemoveEntry(entry)`、`onAddSupport(payload)`、`onEditSupport(entry)`
- 顶部合计只用 duty 的 `effective_hours`

- [ ] **Step 1: 实现 `StatusMultiPick`**

对话框：加载 `/api/employees`；对已占用姓名（传入 `occupiedMap: Record<name, label>`）禁用；确认返回选中姓名数组。

```jsx
export default function StatusMultiPick({
  open,
  title,
  initialSelected = [],
  occupiedMap = {},
  allowStatusLabel, // '休息' | '请假' — 已在该状态者可选（用于编辑集合）
  onConfirm,
  onClose,
}) {
  // checkbox list; occupied unless allowStatusLabel matches occupiedMap[name]
}
```

- [ ] **Step 2: 改造 `DayPanel` 布局**

按规格分段：标题到岗合计 → 摘要休息/请假/支援人数 → 操作（新增到岗文案）→ 到岗列表（徽章）→ 休息 chips → 请假 chips → 支援虚线卡。

徽章：

```jsx
{entry.is_external ? <span className="badge badge--external">外援</span> : null}
{entry.is_trial ? <span className="badge badge--trial">试工</span> : null}
```

支援卡显示时段 +「不计入本店工时」+ 编辑/删除。

休息/请假：点「+ 添加」打开 `StatusMultiPick`；点 chip × 调用删除该 entry。

- [ ] **Step 3: `CalendarPage` 同步休息/请假集合**

```javascript
async function syncStatusNames(status, nextNames) {
  const current = entries.filter((e) => e.status === status)
  const currentNames = new Set(current.map((e) => e.employee_name))
  const nextSet = new Set(nextNames)
  for (const row of current) {
    if (!nextSet.has(row.employee_name)) {
      await api.delete(`/api/entries/${row.id}`)
    }
  }
  for (const name of nextNames) {
    if (!currentNames.has(name)) {
      await api.post('/api/entries', { work_date: selectedDate, name, status })
    }
  }
  await Promise.all([refreshCalendar(), refreshEntries()])
}
```

支援创建/更新：`status: 'support'` + 时段。

到岗列表 `sumHours` 只对 duty。

草稿复制：payload 增加 `is_external`/`is_trial`；若源为 support，复制为 support（或本版仅允许到岗草稿——若源非 on_duty，隐藏「复制」或复制为同 status）。**本版规则：支援行提供编辑/删除；「复制」按钮仅 on_duty 显示。**

- [ ] **Step 4: CSS** — `.badge--external` 蓝、`.badge--trial` 琥珀、`.day-panel__support-item` 虚线边框、`.chip` 圆角。

- [ ] **Step 5: `npm run build` 通过；浏览器手测与可交互原型一致的主路径。**

Run: `cd frontend && npm run build`  
Expected: 成功

---

### Task 8: 预览文案分区

**Files:**
- Modify: `frontend/src/utils/dayPreviewText.js`
- Modify: `frontend/src/components/DayPreviewModal.jsx`

**Interfaces:**
- `sumPreviewHours(entries)` 只加 `status === 'on_duty'`（缺省视为 on_duty）
- `formatDayPreviewText` 输出：到岗块（姓名可含 `[外援]`/`[试工]`）→ 休息 → 请假 → 支援（标注不计入）

- [ ] **Step 1: 重写预览格式化**

```javascript
function dutyNameLabel(entry) {
  let n = entry?.employee_name?.trim() || '—'
  const tags = []
  if (entry?.is_external) tags.push('外援')
  if (entry?.is_trial) tags.push('试工')
  if (tags.length) n = `${n}[${tags.join(',')}]`
  return `${n}：`
}

export function formatDayPreviewText(entries = [], { dateLabel = '' } = {}) {
  const list = Array.isArray(entries) ? entries : []
  if (!list.length) return ''
  const duty = list.filter((e) => (e.status || 'on_duty') === 'on_duty')
  const rest = list.filter((e) => e.status === 'rest')
  const leave = list.filter((e) => e.status === 'leave')
  const support = list.filter((e) => e.status === 'support')

  const sections = []
  if (duty.length) {
    // reuse width padding on duty rows with dutyNameLabel
    sections.push(/* formatted duty block */)
  }
  if (rest.length) {
    sections.push(`休息：${rest.map((e) => e.employee_name).join('、')}`)
  }
  if (leave.length) {
    sections.push(`请假：${leave.map((e) => e.employee_name).join('、')}`)
  }
  if (support.length) {
    const lines = support.map((e) => {
      const range = `${formatPreviewTime(e.start_time)}-${formatPreviewTime(e.end_time)}`
      return `${e.employee_name}：  ${range}  (支援·不计入本店)`
    })
    sections.push(`支援：\n${lines.join('\n')}`)
  }
  const body = sections.join('\n')
  if (!dateLabel) return body
  return `${formatDayPreviewHeader(dateLabel, duty)}\n${body}`
}
```

- [ ] **Step 2: 手测预览弹窗：合计不含支援；文本含分区。**

---

### Task 9: 统计看板 UI

**Files:**
- Modify: `frontend/src/components/StatsPeopleTable.jsx`
- Modify: `frontend/src/styles/global.css`（leave/support 行样式）

**Interfaces:**
- 表头增加「支援天数」「支援工时」
- 逐日：`leave` 显示「请假」；`support` 显示时段 +「支援」且工时可用 Metric 但样式区分；`rest` 仍为休息

- [ ] **Step 1: 扩展表列与逐日渲染**

```jsx
<th>支援天数</th>
<th>支援工时</th>
...
<td><Metric value={person.support_days} /></td>
<td><Metric value={person.support_hours} unit="h" chip /></td>
```

逐日：

```jsx
const label =
  day.status === 'rest' ? '休息' :
  day.status === 'leave' ? '请假' :
  day.status === 'support' ? `${day.start_time} – ${day.end_time}（支援）` :
  `${day.start_time} – ${day.end_time}`
```

- [ ] **Step 2: 手测统计页与 Task 4 API 数据一致。**

- [ ] **Step 3: 全量后端回归**

Run: `cd backend && pytest -v`  
Expected: PASS

- [ ] **Step 4: 前端 build**

Run: `cd frontend && npm run build`  
Expected: 成功

---

## Plan Self-Review

| Spec 项 | Task |
|---------|------|
| 分段列表 UI A | Task 7 |
| 休息/请假多选无时段 | Task 2 + 7 |
| 外援/试工勾选可并存 | Task 2 + 6 |
| 支援有时段不计本店 | Task 2–4 + 7 |
| 互斥 | Task 2（唯一约束 + 文案） |
| 月历仅到岗 | Task 3 |
| 统计休息/支援口径 | Task 4 + 9 |
| 预览分区 | Task 8 |
| 复制保留字段 | Task 5 |
| 清空当日全状态 | 既有 clear API，无需改（Task 7 确认文案） |

无 TBD；`EntryUpdate.clear_times` 若嫌冗余，实现时可用「status 改为 rest/leave 即清空时段」替代，不改变对外 API。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-14-day-panel-status.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每任务新开子代理，任务间复查，迭代快  

**2. Inline Execution** — 本会话用 executing-plans 按任务推进，设检查点  

Which approach?
