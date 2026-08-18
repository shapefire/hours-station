# 排班文本快速导入 + 加班段 + 整日备注 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 日详情粘贴多日排班文本 → 预览纠错 → 批量写入；原生支持可选加班段；新增整日备注。

**Architecture:** 后端纯函数 `parse_roster_text` + `POST /api/entries/import/preview|commit` 两步导入；`work_entries` 增加 `ot_start_time`/`ot_end_time`；独立 `day_notes` 表；有效工时 = 主时段 + 加班段各自套用现有扣减规则后相加。前端日详情入口弹层，日常表单同步支持加班段与整日备注。

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, React, Vite

## Global Constraints

- 同人同日覆盖；文本未提及的人保留
- 无时段支援：预览标红，补时段后才可 commit
- 年 = 日历视图年；月日 = 文本
- 行末括号时段 = 改主时段；行首「姓名+时段」= 加班段
- 文本尾随小时数忽略；个人工时以系统为准
- 新人 `get_or_create`；整请求 commit 单一事务，失败整批回滚
- 不改统计看板休息天数口径；工时数字纳入加班段
- commit 消息用中文总结（1–2 句），除非用户另有要求

## File Structure

| 文件 | 职责 |
|------|------|
| `backend/alembic/versions/006_ot_and_day_notes.py` | 加班列 + `day_notes` 表 |
| `backend/app/models.py` | `WorkEntry` OT 字段；`DayNote` 模型 |
| `backend/app/schemas.py` | Entry OT；day note；import preview/commit |
| `backend/app/services/entries.py` | 规范化 OT；`format_entry_hours` 含 OT；create/update/copy 透传 OT |
| `backend/app/services/day_notes.py` | get / upsert / delete by date |
| `backend/app/services/roster_text_import.py` | `parse_roster_text`；preview 校验；commit 批量 upsert |
| `backend/app/services/employees.py` | 月工时合计改用 entry 总有效工时（含 OT；含 rest 仅 OT） |
| `backend/app/services/stats.py` / `calendar.py` | 日合计走 `format_entry_hours`（或共享 decimal 版） |
| `backend/app/routers/entries.py` | import preview/commit；create/patch 传 OT |
| `backend/app/routers/day_notes.py` | PUT 整日备注 |
| `backend/app/main.py` | 注册 day_notes router |
| `backend/tests/test_roster_text_parse.py` | 解析金样与单元 |
| `backend/tests/test_entries_ot.py` | OT 工时、rest+OT、API |
| `backend/tests/test_day_notes.py` | 整日备注 CRUD |
| `backend/tests/test_roster_text_import_api.py` | preview/commit/覆盖/回滚 |
| `frontend/src/components/RosterTextImportModal.jsx` | 粘贴 → 预览 → 确认 |
| `frontend/src/components/DayNoteEditor.jsx` | 日详情整日备注 |
| `frontend/src/components/EntryForm.jsx` / `SupportForm.jsx` / `DayPanel.jsx` | 加班段 UI；列表展示；导入入口 |
| `frontend/src/pages/CalendarPage.jsx` | 提交 OT；拉取/保存 day_note；打开导入弹层 |
| `frontend/src/styles/global.css` | 导入弹层 / 加班 / 整日备注样式 |

---

### Task 1: Migration + 模型（加班列 + day_notes）

**Files:**
- Create: `backend/alembic/versions/006_ot_and_day_notes.py`
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_entries_ot.py`（先写最小「模型可写入 OT」或依赖后续 API 测；本任务以 migration 可 upgrade 为准）

**Interfaces:**
- Produces: `WorkEntry.ot_start_time` / `ot_end_time`；`DayNote(work_date unique, note)`

- [ ] **Step 1: 写 Alembic 006**

```python
"""ot times and day_notes

Revision ID: 006_ot_and_day_notes
Revises: 005_work_entry_status
Create Date: 2026-08-18
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006_ot_and_day_notes"
down_revision: Union[str, Sequence[str], None] = "005_work_entry_status"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("work_entries", sa.Column("ot_start_time", sa.Time(), nullable=True))
    op.add_column("work_entries", sa.Column("ot_end_time", sa.Time(), nullable=True))
    op.create_table(
        "day_notes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("work_date", name="uq_day_notes_work_date"),
    )

def downgrade() -> None:
    op.drop_table("day_notes")
    op.drop_column("work_entries", "ot_end_time")
    op.drop_column("work_entries", "ot_start_time")
```

- [ ] **Step 2: 更新 `models.py`**

在 `WorkEntry` 增加：

```python
ot_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
ot_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
```

新增：

```python
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
```

- [ ] **Step 3: 跑 migration（开发库）**

Run: `cd backend && alembic upgrade head`  
Expected: 成功升到 `006_ot_and_day_notes`

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/006_ot_and_day_notes.py backend/app/models.py
git commit -m "$(cat <<'EOF'
为排班增加加班时段字段与整日备注表。

EOF
)"
```

---

### Task 2: 加班段规范化与工时合计

**Files:**
- Modify: `backend/app/schemas.py`（`EntryCreate`/`EntryUpdate`/`EntryOut` 增加 OT；序列化同主时段）
- Modify: `backend/app/services/entries.py`
- Modify: `backend/app/services/employees.py`（`_month_hours_by_employee`）
- Modify: `backend/app/services/stats.py`、`backend/app/routers/calendar.py`（凡直接 `effective_hours(start,end)` 算 entry 的，改走共享合计）
- Modify: `backend/app/routers/entries.py`（create/patch/copy 传 OT）
- Test: `backend/tests/test_entries_ot.py`

**Interfaces:**
- Consumes: `WorkEntry.ot_*`
- Produces:
  - `_normalize_ot_times(ot_start, ot_end) -> tuple[time|None, time|None]`
  - `entry_hours_decimal(entry) -> Decimal`（主+OT）
  - `format_entry_hours(entry) -> str` 含 OT；rest/leave 无主时段时仅 OT
  - `create_entry(..., ot_start_time=None, ot_end_time=None)`
  - `entry_to_dict` 含 `ot_start_time`/`ot_end_time`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/test_entries_ot.py
from datetime import time
from decimal import Decimal

def test_create_on_duty_with_ot_sums_hours(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "苑菱",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    })
    assert r.status_code == 201
    # 主 8h→有效 7.5；OT 1.5→1.5；合计 9.0（默认档 raw>=6 扣 0.5 只作用于主段）
    assert r.json()["effective_hours"] == "9.0"
    assert r.json()["ot_start_time"] == "22:00"
    assert r.json()["ot_end_time"] == "23:30"

def test_rest_with_ot_only_counts_ot(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "继鹏",
        "status": "rest",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    })
    assert r.status_code == 201
    assert r.json()["effective_hours"] == "1.5"
    assert r.json()["start_time"] is None

def test_ot_pair_must_be_complete(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "小帅",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "22:00",
    })
    assert r.status_code == 400
```

- [ ] **Step 2: Run 确认失败**

Run: `cd backend && python -m pytest tests/test_entries_ot.py -v`  
Expected: FAIL（字段/逻辑未实现）

- [ ] **Step 3: Schema + normalize + hours + create/update/copy**

在 `entries.py`：

```python
def _normalize_ot_times(
    ot_start_time: time | None,
    ot_end_time: time | None,
) -> tuple[time | None, time | None]:
    if ot_start_time is None and ot_end_time is None:
        return None, None
    if ot_start_time is None or ot_end_time is None:
        raise ValueError("加班时段须同时填写开始与结束")
    format_effective_hours(ot_start_time, ot_end_time)  # 校验 end>start
    return ot_start_time, ot_end_time

def entry_hours_decimal(entry: WorkEntry) -> Decimal:
    total = Decimal("0")
    if entry.start_time is not None and entry.end_time is not None:
        total += effective_hours(entry.start_time, entry.end_time)
    if entry.ot_start_time is not None and entry.ot_end_time is not None:
        total += effective_hours(entry.ot_start_time, entry.ot_end_time)
    return total.quantize(Decimal("0.1"))

def format_entry_hours(entry: WorkEntry) -> str:
    return f"{entry_hours_decimal(entry):.1f}"
```

- `_normalize_entry_fields`：rest/leave 仍清空主时段；**之后**再 `_normalize_ot_times`（允许 rest+OT）。
- `create_entry` / `update_entry`：读写 `ot_*`；`clear_times` 只清主时段，不清 OT，除非显式传 `ot_*=null` 或新增 `clear_ot`（约定：PATCH 显式 `ot_start_time: null` + `ot_end_time: null` 清空）。
- `copy_day` / `copy_person`：复制 `ot_*`。
- `employees._month_hours_by_employee`：对每条 entry 用 `entry_hours_decimal` 累加（含 rest 仅 OT；support 是否进花名册月工时：保持与现网一致——现网只计 `on_duty`，则改为：`status == "on_duty"` 时加主+OT，**另**：`status in ("rest","leave")` 且有 OT 时也加 OT，避免休息加班丢失；support 仍不计月工时，与现网一致）。
- `stats` / `calendar`：日合计改为对每条 `entry_hours_decimal` 求和。

- [ ] **Step 4: Router 透传 OT**

`create_entry` / `patch` 已有 `model_dump`；确保 schema 有字段即可。`copy_person` 走 service。

- [ ] **Step 5: pytest 通过**

Run: `cd backend && python -m pytest tests/test_entries_ot.py tests/test_entries_api.py tests/test_calendar_api.py tests/test_stats_api.py -v`  
Expected: PASS（必要时微调旧断言若日合计定义变了）

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas.py backend/app/services/entries.py backend/app/services/employees.py backend/app/services/stats.py backend/app/routers/calendar.py backend/app/routers/entries.py backend/tests/test_entries_ot.py
git commit -m "$(cat <<'EOF'
支持排班可选加班时段，并按主时段与加班段分别计有效工时后合计。

EOF
)"
```

---

### Task 3: 整日备注 API

**Files:**
- Create: `backend/app/services/day_notes.py`
- Create: `backend/app/routers/day_notes.py`
- Modify: `backend/app/schemas.py`（`DayNoteOut`、`DayNotePut`）
- Modify: `backend/app/main.py`
- Modify: `backend/app/routers/entries.py` — 新增 `GET /api/entries/day?date=` 或扩展现有 list：为减少前端轮次，**新增** `GET /api/day-notes?date=` 返回 `{ note }` 或 404/空；PUT upsert
- Test: `backend/tests/test_day_notes.py`

**Interfaces:**
- Produces:
  - `get_day_note(db, work_date) -> str | None`
  - `put_day_note(db, work_date, note: str) -> str | None` — trim；空串删除行并返回 None
  - `PUT /api/day-notes/{work_date}` body `{ "note": "..." }` → `{ "work_date", "note" }`（note 可 null 表示已清空）
  - `GET /api/day-notes?date=` → `{ "work_date", "note": str|null }`

- [ ] **Step 1: 失败测试**

```python
def test_put_and_get_day_note(client):
    r = client.put("/api/day-notes/2026-08-01", json={"note": "来货"})
    assert r.status_code == 200
    assert r.json()["note"] == "来货"
    g = client.get("/api/day-notes", params={"date": "2026-08-01"})
    assert g.json()["note"] == "来货"

def test_empty_note_deletes(client):
    client.put("/api/day-notes/2026-08-01", json={"note": "来货"})
    r = client.put("/api/day-notes/2026-08-01", json={"note": "  "})
    assert r.status_code == 200
    assert r.json()["note"] is None
```

- [ ] **Step 2: 实现 service + router + 注册**

- [ ] **Step 3: pytest 通过**

Run: `cd backend && python -m pytest tests/test_day_notes.py -v`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/day_notes.py backend/app/routers/day_notes.py backend/app/schemas.py backend/app/main.py backend/tests/test_day_notes.py
git commit -m "$(cat <<'EOF'
新增按日整日备注的读写接口，空内容删除备注。

EOF
)"
```

---

### Task 4: 纯函数解析 `parse_roster_text`

**Files:**
- Create: `backend/app/services/roster_text_import.py`
- Test: `backend/tests/test_roster_text_parse.py`

**Interfaces:**
- Produces:

```python
def parse_time_token(token: str) -> time: ...
def parse_roster_text(text: str, *, year: int) -> dict:
    # {
    #   "days": [ { "work_date": date, "day_note": str|None, "entries": [DraftEntry], "errors": [] } ],
    #   "unparsed_lines": [str],
    # }
# DraftEntry keys: name, status, start_time, end_time, ot_start_time, ot_end_time, is_trial, note, errors: list[str]
```

- [ ] **Step 1: 写解析金样测试（先小后大）**

```python
from datetime import date, time
from app.services.roster_text_import import parse_roster_text, parse_time_token

def test_parse_time_token():
    assert parse_time_token("7.5") == time(7, 30)
    assert parse_time_token("23.5") == time(23, 30)
    assert parse_time_token("16") == time(16, 0)

def test_parse_duty_trial_and_note():
    text = "8月1 周六\n16-23.5嘉岚（卫生）6.5\n8-13林航（试工水果位）5\n总：72.5"
    result = parse_roster_text(text, year=2026)
    day = result["days"][0]
    assert day["work_date"] == date(2026, 8, 1)
    by_name = {e["name"]: e for e in day["entries"]}
    assert by_name["嘉岚"]["start_time"] == time(16, 0)
    assert by_name["嘉岚"]["end_time"] == time(23, 30)
    assert by_name["嘉岚"]["note"] == "卫生"
    assert by_name["林航"]["is_trial"] is True
    assert "试工" in (by_name["林航"]["note"] or "")

def test_parse_shift_change_paren():
    text = "8月4 周二\n8.5-19苑菱（早值、检查效期）10（10-23.5）"
    day = parse_roster_text(text, year=2026)["days"][0]
    e = day["entries"][0]
    assert e["name"] == "苑菱"
    assert e["start_time"] == time(10, 0)
    assert e["end_time"] == time(23, 30)

def test_parse_rest_and_ot_line():
    text = "8月4 周二\n继鹏22-23.5\n休息：梓野 锶锴 继鹏"
    day = parse_roster_text(text, year=2026)["days"][0]
    jp = next(e for e in day["entries"] if e["name"] == "继鹏")
    assert jp["status"] == "rest"
    assert jp["ot_start_time"] == time(22, 0)
    assert jp["ot_end_time"] == time(23, 30)
    assert jp["start_time"] is None

def test_parse_support_missing_times_error():
    text = "8月4 周二\n支援上社：洁怡"
    day = parse_roster_text(text, year=2026)["days"][0]
    e = day["entries"][0]
    assert e["status"] == "support"
    assert e["note"] == "上社"
    assert "missing_support_times" in e["errors"]

def test_parse_support_with_times():
    text = "8月14 周五\n支援：洁慧 12-21"
    day = parse_roster_text(text, year=2026)["days"][0]
    e = day["entries"][0]
    assert e["status"] == "support"
    assert e["start_time"] == time(12, 0)
    assert e["end_time"] == time(21, 0)
    assert e["errors"] == []

def test_parse_day_note():
    text = "8月2 周日 团餐47\n8-16苑菱（早值）7.5"
    day = parse_roster_text(text, year=2026)["days"][0]
    assert day["day_note"] == "团餐47"
```

再用用户样例中 **8/1 与 8/4** 各做一条集成解析断言（人数、关键人名、改班、加班）。不必一次断言 8/1–8/14 全量。

- [ ] **Step 2: Run 确认失败**

Run: `cd backend && python -m pytest tests/test_roster_text_parse.py -v`  
Expected: FAIL

- [ ] **Step 3: 实现解析器**

建议内部结构：

1. `TIME_RE = r"(\d{1,2}(?:\.\d)?)"`
2. 日期行：`^(\d{1,2})\s*月\s*(\d{1,2})`；去掉 `周[一二三四五六日天]` / `星期.` 后剩余为 `day_note`
3. 忽略：`^\s*总\s*[:：]`、空行
4. 休息/请假：`^(休息|请假)\s*[:：]\s*(.+)$` → 拆名
5. 支援：`^支援([^:：]*)[:：]\s*(.+)$` — 地点词进 note；名字后可选 `12-21`
6. 到岗：`^{TIME}-{TIME}(.+)$` 再拆姓名、`（...）`、尾随小时、改班括号
7. 加班：`^([\u4e00-\u9fff]{2,4}){TIME}-{TIME}\s*$`
8. 同日同名 dict 合并，后写覆盖；加班行只写 `ot_*`

解析后对每条草稿跑轻量校验填 `errors`（`missing_support_times`、`invalid_time_range`、到岗缺时段等）。

- [ ] **Step 4: pytest 通过**

Run: `cd backend && python -m pytest tests/test_roster_text_parse.py -v`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/roster_text_import.py backend/tests/test_roster_text_parse.py
git commit -m "$(cat <<'EOF'
实现排班文本解析：到岗、改班、加班、休息请假支援与整日备注。

EOF
)"
```

---

### Task 5: Import preview + commit API

**Files:**
- Modify: `backend/app/schemas.py`（`RosterImportPreviewIn`、`RosterImportPreviewOut`、`RosterImportCommitIn`、`RosterImportCommitOut`）
- Modify: `backend/app/services/roster_text_import.py`（`preview_roster_import`、`commit_roster_import`）
- Modify: `backend/app/routers/entries.py`
- Test: `backend/tests/test_roster_text_import_api.py`

**Interfaces:**
- `POST /api/entries/import/preview` `{ text, year }` → parse 结果（time 序列化为 `HH:MM`）
- `POST /api/entries/import/commit` `{ days: [{ work_date, day_note?: str|null|omit, entries: [...] }] }`
  - `day_note` omit/不改；`""` 删除；非空 upsert
  - 每人 upsert 覆盖；未出现的人保留
  - 返回 `{ created, updated, day_notes_upserted }`
  - 单事务；规范化失败 400 回滚

- [ ] **Step 1: 失败测试**

```python
SAMPLE = """8月1 周六 完成自检
8-16梓野（早值）7.5
休息：苑菱
支援上社：洁怡
"""

def test_preview_flags_support_without_times(client):
    r = client.post("/api/entries/import/preview", json={"text": SAMPLE, "year": 2026})
    assert r.status_code == 200
    day = r.json()["days"][0]
    assert day["work_date"] == "2026-08-01"
    assert day["day_note"] == "完成自检"
    support = next(e for e in day["entries"] if e["name"] == "洁怡")
    assert "missing_support_times" in support["errors"]

def test_commit_overwrites_same_person_keeps_others(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-01", "name": "张三",
        "start_time": "08:00", "end_time": "16:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-01", "name": "梓野",
        "start_time": "09:00", "end_time": "17:00",
    })
    payload = {
        "days": [{
            "work_date": "2026-08-01",
            "day_note": "完成自检",
            "entries": [{
                "name": "梓野", "status": "on_duty",
                "start_time": "08:00", "end_time": "16:00",
                "ot_start_time": None, "ot_end_time": None,
                "is_trial": False, "note": "早值",
            }],
        }]
    }
    r = client.post("/api/entries/import/commit", json=payload)
    assert r.status_code == 200
    assert r.json()["updated"] + r.json()["created"] >= 1
    listed = client.get("/api/entries", params={"date": "2026-08-01"}).json()
    names = {e["employee_name"]: e for e in listed}
    assert "张三" in names
    assert names["梓野"]["start_time"] == "08:00"
    assert names["梓野"]["note"] == "早值"
    note = client.get("/api/day-notes", params={"date": "2026-08-01"}).json()
    assert note["note"] == "完成自检"

def test_commit_rejects_support_without_times(client):
    r = client.post("/api/entries/import/commit", json={
        "days": [{
            "work_date": "2026-08-01",
            "entries": [{
                "name": "洁怡", "status": "support",
                "start_time": None, "end_time": None,
                "is_trial": False, "note": "上社",
            }],
        }]
    })
    assert r.status_code == 400
```

- [ ] **Step 2: 实现 commit**

对每条 entry：查找同日同员工 → `update_entry` 全量字段，或 `create_entry`。  
`day_note`：按约定调用 `put_day_note`。  
不要在 commit 内重新 parse；信任前端编辑后的草稿，但仍跑 `_normalize_*`。

- [ ] **Step 3: Router 注册在 `/import/preview` 与 `/import/commit`（须写在 `/{entry_id}` 之前，避免被当成 id）**

- [ ] **Step 4: pytest 通过**

Run: `cd backend && python -m pytest tests/test_roster_text_import_api.py tests/test_roster_text_parse.py -v`

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py backend/app/services/roster_text_import.py backend/app/routers/entries.py backend/tests/test_roster_text_import_api.py
git commit -m "$(cat <<'EOF'
提供排班文本导入的预览与提交接口，同人覆盖且整批事务。

EOF
)"
```

---

### Task 6: 前端日常加班段 + 列表展示

**Files:**
- Modify: `frontend/src/components/EntryForm.jsx`
- Modify: `frontend/src/components/SupportForm.jsx`
- Modify: `frontend/src/components/DayPanel.jsx`（列表行显示加班；复制草稿带 OT）
- Modify: `frontend/src/pages/CalendarPage.jsx`（create/patch/support/copy 传 `ot_*`）
- Modify: `frontend/src/styles/global.css`
- 休息/请假：若 `StatusMultiPick` 仅设状态无时段，加班需在列表行「编辑」扩展——**最小方案**：到岗/支援表单加 OT；休息+OT 主要通过导入写入；日列表面板对 rest/leave 行增加可选「补加班」折叠编辑（或复用小型 inline）。若时间紧：**先做 EntryForm + SupportForm OT**；rest 行在 DayPanel 增加「加班」快捷编辑（两个 TimeField + 保存 PATCH）。

**Interfaces:**
- Form payload 增加 `ot_start_time` / `ot_end_time`（空则 null）
- 列表：主时段旁若有 OT 显示 `加班 22:00–23:30`

- [ ] **Step 1: EntryForm / SupportForm 增加可选加班两个 TimeField；空对提交为 null**
- [ ] **Step 2: CalendarPage 所有写 entry 的路径带上 OT**
- [ ] **Step 3: DayPanel 列表展示 OT；rest/leave 可 PATCH OT**
- [ ] **Step 4: `npm run build`**
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/EntryForm.jsx frontend/src/components/SupportForm.jsx frontend/src/components/DayPanel.jsx frontend/src/pages/CalendarPage.jsx frontend/src/styles/global.css
git commit -m "$(cat <<'EOF'
表单与日列表支持加班时段展示与编辑。

EOF
)"
```

---

### Task 7: 前端整日备注

**Files:**
- Create: `frontend/src/components/DayNoteEditor.jsx`
- Modify: `frontend/src/components/DayPanel.jsx`（标题区嵌入）
- Modify: `frontend/src/pages/CalendarPage.jsx`（选日时 GET note；保存 PUT）
- Modify: `frontend/src/styles/global.css`

- [ ] **Step 1: `DayNoteEditor`** — 展示当前备注；点击编辑；保存调用 `onSave(note)`；清空传 `""`
- [ ] **Step 2: CalendarPage** — `refreshDayNote` 与 entries 并行；传入 DayPanel
- [ ] **Step 3: build**
- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DayNoteEditor.jsx frontend/src/components/DayPanel.jsx frontend/src/pages/CalendarPage.jsx frontend/src/styles/global.css
git commit -m "$(cat <<'EOF'
日详情支持查看与编辑整日备注。

EOF
)"
```

---

### Task 8: 文本导入弹层

**Files:**
- Create: `frontend/src/components/RosterTextImportModal.jsx`
- Modify: `frontend/src/components/DayPanel.jsx`（顶部「文本导入」按钮）
- Modify: `frontend/src/pages/CalendarPage.jsx`（传入 `year={calendarYear}`、成功回调刷新）
- Modify: `frontend/src/styles/global.css`

**行为：**
1. 大文本框粘贴 →「解析预览」→ `POST /api/entries/import/preview`（`year` 来自日历当前年）
2. 按日分组展示；整日备注可改；每人可改状态/主时段/OT/试工/备注
3. 有 `errors` 的行标红；存在任意阻断错误时禁用「确认导入」
4. 确认 → `POST /api/entries/import/commit` 提交**当前编辑后的草稿**（非原文）
5. 成功：关弹层；`refreshCalendar` + `refreshEntries` + `refreshDayNote`

- [ ] **Step 1: 实现 Modal 状态机：`edit_text` | `preview` | `submitting`**
- [ ] **Step 2: DayPanel 入口；CalendarPage 接线 year**
- [ ] **Step 3: build**
- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RosterTextImportModal.jsx frontend/src/components/DayPanel.jsx frontend/src/pages/CalendarPage.jsx frontend/src/styles/global.css
git commit -m "$(cat <<'EOF'
日详情增加排班文本导入：粘贴解析预览后批量确认写入。

EOF
)"
```

---

### Task 9: 端到端验证

- [ ] **Step 1: 后端全量相关测试**

Run:

```bash
cd backend && python -m pytest tests/test_entries_ot.py tests/test_day_notes.py tests/test_roster_text_parse.py tests/test_roster_text_import_api.py tests/test_entries_api.py tests/test_calendar_api.py tests/test_copy_api.py tests/test_stats_api.py -v
```

Expected: PASS

- [ ] **Step 2: 前端 build**

Run: `cd frontend && npm run build`  
Expected: 成功

- [ ] **Step 3: 手工清单（开发者）**
  1. 粘贴用户 8/1–8/4 样例 → 预览：改班苑菱、继鹏休息+加班、无时段支援标红
  2. 给支援补时段后可提交；日历与日列表刷新
  3. 同日已有「张三」不在文本中 → 仍在
  4. 整日备注显示并可改
  5. 到岗表单填加班 → 工时合计正确

- [ ] **Step 4: 若有修复，单独 commit；无则结束**

---

## Spec self-review (plan author)

| Spec 项 | Task |
|---------|------|
| OT 字段 + 工时主+OT | T1–T2 |
| rest+OT | T2 |
| day_notes | T1, T3, T7 |
| parse 规则（改班/加班/试工/支援/总行） | T4 |
| preview/commit、覆盖、保留未提及、事务 | T5 |
| 入口日详情、预览纠错 | T8 |
| 日常表单加班 | T6 |
| 复制带 OT | T2 |
| 月/日/统计工时 | T2 |
| 金样测试 | T4, T9 |

无 TBD 占位；路由须把 `/import/*` 注册在 `/{entry_id}` 之前（T5 已写明）。
