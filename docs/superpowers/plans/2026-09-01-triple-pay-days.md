# 三薪日功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在工作日历右侧面板可把某日期设为三薪日（默认非），导出三薪列填入当月各三薪日当天有效工时（含加班、含满点扣减，支援不计）×2 之和。

**Architecture:** 后端新增 `TriplePayDay` 表（`work_date` 唯一）存三薪日；`PUT /api/triple-pay-days/{work_date}` 设置/取消，`GET /api/calendar` 响应带当月 `triple_pay_dates`；导出时对每人累加三薪日 `entry_hours_decimal×2` 写入 AM 列；前端 DayPanel 加开关、MonthCalendar 加徽标。

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL（测试用 `psycopg`）；openpyxl（导出）；React 19 + Vite（前端）。

**Spec:** `docs/superpowers/specs/2026-09-01-triple-pay-days-design.md`（需求真相源 `docs/superpowers/clarifications/2026-09-01-triple-pay-days.md`）

## Global Constraints

- 三薪值口径 = `entry_hours_decimal(entry)`（主时段 + 加班段，均含满点扣减），跳过 `status=="support"`。
- 三薪列 = Σ(当月三薪日的 `entry_hours_decimal × 2`)，`0.1h` 量化后写**数值**（非公式）。
- 第 1 位人员三薪值写 off 行（AM4，避免覆盖 AM3 表头文字「三薪」）；其余写各自 on 行（AM 列）。
- 无三薪日 / 无符合条件工时 → AM 格留空（`None`）。
- 不改现有总工时 / 月历合计 / 统计看板 / 核审口径；`support` 不计本店工时故不计三薪。
- 三薪日日期级全店生效；复制当天/单人不复制标记；文本导入不支持三薪日。
- 测试基线：163 passed（改动前）；全程保持全量测试绿。

## Review Focus

| # | 输入/条件 | 期望行为 | 归属任务 |
|---|---|---|---|
| 1 | 三薪日当天员工只有支援 | 三薪列留空 | Task 3 |
| 2 | 三薪日当天员工休息/请假且无加班 | 三薪列留空（`entry_hours_decimal`=0） | Task 3 |
| 3 | 一个月多个三薪日 | 求和，不覆盖 | Task 3 |
| 4 | 取消三薪日后再导出 | 该日不再计入 | Task 2 + 3 |
| 5 | 超出模板 15 人槽位的员工 | 三薪列同口径写入 AM 值槽 | Task 3 |

---

### Task 1: 三薪日数据模型 + 迁移 + 服务层

**Files:**
- Create: `backend/app/services/triple_pay_days.py`
- Create: `backend/alembic/versions/012_triple_pay_days.py`
- Create: `backend/tests/test_triple_pay_days.py`
- Modify: `backend/app/models.py`（新增 `TriplePayDay`）
- Modify: `backend/tests/conftest.py`（`from app.models import ...` 增 `TriplePayDay`）

**Interfaces:**
- Produces: `TriplePayDay`（`id: UUID` PK、`work_date: date` 唯一、`created_at: datetime`）；`set_triple_pay_day(db, work_date: date, is_triple_pay: bool) -> bool`；`list_triple_pay_dates(db, year: int, month: int) -> list[date]`；`triple_pay_dates_between(db, start: date, end: date) -> set[date]`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_triple_pay_days.py`（用 `db` fixture 直接调服务函数）：
```python
def test_set_and_unset_triple_pay_day(db):
    d = date(2026, 9, 1)
    assert set_triple_pay_day(db, d, True) is True
    assert list_triple_pay_dates(db, 2026, 9) == [d]
    assert set_triple_pay_day(db, d, False) is False
    assert list_triple_pay_dates(db, 2026, 9) == []
    assert set_triple_pay_day(db, d, False) is False  # 幂等取消

def test_triple_pay_dates_between_range(db):
    for d in (date(2026, 8, 31), date(2026, 9, 1), date(2026, 9, 30)):
        set_triple_pay_day(db, d, True)
    assert triple_pay_dates_between(db, date(2026, 9, 1), date(2026, 9, 30)) == {date(2026, 9, 1), date(2026, 9, 30)}
```

- [ ] **Step 2: 运行确认失败** —— 在 `backend/` 目录运行 `pytest tests/test_triple_pay_days.py -v`，预期 ImportError/AttributeError。

- [ ] **Step 3: 实现** `TriplePayDay` 模型（`models.py`，仿 `DayNote`：`id` PK + `work_date` 唯一 + `created_at` server_default func.now()）、migration `012`（`op.create_table("triple_pay_days", ...)`，`down_revision="011_review_access_token"`）、`triple_pay_days.py` 服务三函数（`set` 用 upsert/delete；`list` 按月过滤排序；`between` 区间过滤返回 set）。

- [ ] **Step 4: 运行确认通过** —— 在 `backend/` 目录运行 `pytest tests/test_triple_pay_days.py -v`，预期 PASS。

- [ ] **Step 5: Commit** —— `git add backend/app/models.py backend/app/services/triple_pay_days.py backend/alembic/versions/012_triple_pay_days.py backend/tests/test_triple_pay_days.py backend/tests/conftest.py && git commit -m "feat: 三薪日数据模型与服务层"`

---

### Task 2: 三薪日 PUT 端点 + calendar 响应集成

**Files:**
- Create: `backend/app/routers/triple_pay_days.py`
- Modify: `backend/app/main.py`（注册 router）
- Modify: `backend/app/schemas.py`（`TriplePayDayPut`、`TriplePayDayOut`；`CalendarMonthOut` 增 `triple_pay_dates: list[date]`）
- Modify: `backend/app/routers/calendar.py`（查询当月三薪日并入响应）
- Test: `backend/tests/test_triple_pay_days.py`（追加）

**Interfaces:**
- Consumes: Task 1 的 `set_triple_pay_day` / `list_triple_pay_dates`
- Produces: `PUT /api/triple-pay-days/{work_date}`（body `{is_triple_pay: bool}` → `{work_date, is_triple_pay}`）；`CalendarMonthOut.triple_pay_dates: list[date]`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_triple_pay_days.py`（用 `client` fixture）：
```python
def test_put_triple_pay_day_and_calendar(client):
    r = client.put("/api/triple-pay-days/2026-09-01", json={"is_triple_pay": True})
    assert r.json() == {"work_date": "2026-09-01", "is_triple_pay": True}
    cal = client.get("/api/calendar?year=2026&month=9").json()
    assert "2026-09-01" in cal["triple_pay_dates"]
    client.put("/api/triple-pay-days/2026-09-01", json={"is_triple_pay": False})
    cal = client.get("/api/calendar?year=2026&month=9").json()
    assert cal["triple_pay_dates"] == []
```

- [ ] **Step 2: 运行确认失败** —— 在 `backend/` 目录运行 `pytest tests/test_triple_pay_days.py::test_put_triple_pay_day_and_calendar -v`，预期 404/断言失败。

- [ ] **Step 3: 实现** `schemas.py` 增 `TriplePayDayPut(is_triple_pay: bool)`、`TriplePayDayOut(work_date, is_triple_pay)`、`CalendarMonthOut.triple_pay_dates: list[date]`；`routers/triple_pay_days.py` 增 `PUT /{work_date}`（调 `set_triple_pay_day`）；`calendar.py` 查当月 `list_triple_pay_dates` 并入 `CalendarMonthOut`；`main.py` 注册。

- [ ] **Step 4: 运行确认通过** —— 在 `backend/` 目录运行 `pytest tests/test_triple_pay_days.py -v`，预期 PASS。

- [ ] **Step 5: Commit** —— `git add backend/app/schemas.py backend/app/routers/triple_pay_days.py backend/app/routers/calendar.py backend/app/main.py backend/tests/test_triple_pay_days.py && git commit -m "feat: 三薪日 PUT 端点与 calendar 响应"`

---

### Task 3: 导出三薪列计算

**Files:**
- Modify: `backend/app/services/hr_excel_export.py`（`_clear_triple_pay_stat` → `_write_triple_pay`；`build_export_workbook` 查当月三薪日；`_fill_person` 传入）
- Test: `backend/tests/test_hr_excel_export.py`（追加）

**Interfaces:**
- Consumes: Task 1 的 `triple_pay_dates_between`；`app.services.entries.entry_hours_decimal`
- Produces: `_write_triple_pay(ws, on_r, off_r, person_index, entries: list[WorkEntry], triple_pay_dates: set[date]) -> None`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_hr_excel_export.py`（用 `client` 造 entry 后 `build_export_workbook` 读 AM 列；`TRIPLE_PAY_COL = 38`，AM 列 = `TRIPLE_PAY_COL + 1`）：
```python
def test_triple_pay_value_is_hours_times_two(client, db):
    client.put("/api/triple-pay-days/2026-08-01", json={"is_triple_pay": True})
    client.post("/api/entries", json={"work_date": "2026-08-01", "name": "张三",
                                      "start_time": "08:00", "end_time": "16:00"})
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    on_r = PERSON_START_ROW + 1  # 张三第 1 位
    # 08:00-16:00 有效 7.5h → ×2 = 15.0，写在 off 行 AM4
    assert ws.cell(on_r + 1, TRIPLE_PAY_COL + 1).value in (15, 15.0)

def test_triple_pay_sum_and_exclusions(client, db):
    client.put("/api/triple-pay-days/2026-08-01", json={"is_triple_pay": True})
    client.put("/api/triple-pay-days/2026-08-02", json={"is_triple_pay": True})
    client.post("/api/entries", json={"work_date": "2026-08-01", "name": "张三",
                                      "start_time": "08:00", "end_time": "16:00",
                                      "ot_start_time": "16:00", "ot_end_time": "18:00"})
    client.post("/api/entries", json={"work_date": "2026-08-02", "name": "张三",
                                      "start_time": "08:00", "end_time": "16:00"})
    client.post("/api/entries", json={"work_date": "2026-08-01", "name": "李四", "status": "support"})
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    on_r = PERSON_START_ROW + 1
    # 8/1: 7.5 + 2.0(OT,<6h不扣)=9.5 → ×2=19.0；8/2: 7.5×2=15.0；合计 34.0
    assert ws.cell(on_r + 1, TRIPLE_PAY_COL + 1).value in (34, 34.0)

def test_no_triple_pay_day_leaves_am_empty(client, db):
    client.post("/api/entries", json={"work_date": "2026-08-01", "name": "张三",
                                      "start_time": "08:00", "end_time": "16:00"})
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    on_r = PERSON_START_ROW + 1
    assert ws.cell(on_r + 1, TRIPLE_PAY_COL + 1).value in (None, "")

def test_triple_pay_excludes_support_and_rest_without_ot(client, db):
    client.put("/api/triple-pay-days/2026-08-01", json={"is_triple_pay": True})
    client.post("/api/entries", json={"work_date": "2026-08-01", "name": "李四", "status": "support"})
    client.post("/api/entries", json={"work_date": "2026-08-01", "name": "王五", "status": "rest"})
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    # person0 off 行(AM4) 与 person1 on 行(AM5) 均留空
    assert ws.cell(PERSON_START_ROW + 1, TRIPLE_PAY_COL + 1).value in (None, "")
    assert ws.cell(PERSON_START_ROW + ROWS_PER_PERSON + 1, TRIPLE_PAY_COL + 1).value in (None, "")

def test_triple_pay_beyond_template_slots(client, db):
    # 15 人槽位外员工同样按口径写入 AM 值槽
    client.put("/api/triple-pay-days/2026-08-01", json={"is_triple_pay": True})
    for i in range(TEMPLATE_PERSON_SLOTS + 1):
        client.post("/api/entries", json={"work_date": "2026-08-01", "name": f"员工{i + 1}",
                                          "start_time": "08:00", "end_time": "16:00"})
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    extra_index = TEMPLATE_PERSON_SLOTS
    on_r = PERSON_START_ROW + extra_index * ROWS_PER_PERSON + 1
    assert ws.cell(on_r, TRIPLE_PAY_COL + 1).value in (15, 15.0)
```

- [ ] **Step 2: 运行确认失败** —— 在 `backend/` 目录运行 `pytest tests/test_hr_excel_export.py -k triple_pay -v`，预期断言失败（AM 格仍为 None）。

- [ ] **Step 3: 实现** `_write_triple_pay`：遍历 `entries`，跳过 `status=="support"`，对 `work_date in triple_pay_dates` 的累加 `entry_hours_decimal(entry) * 2`，`excel_hour_value` 后写值槽（`person_index==0` → off_r，否则 on_r），合计为 0 则写 None；`build_export_workbook` 用 `triple_pay_dates_between(month_start, month_end)` 取集合；`_fill_person` / `_ensure_person_summary` / `_clear_person_slot` 由 `_clear_triple_pay_stat` 改为 `_write_triple_pay`（清空场景传空 entries）。

- [ ] **Step 4: 运行确认通过** —— 在 `backend/` 目录运行 `pytest tests/test_hr_excel_export.py -v`，预期 PASS（含既有导出测试无回归）。

- [ ] **Step 5: Commit** —— `git add backend/app/services/hr_excel_export.py backend/tests/test_hr_excel_export.py && git commit -m "feat: 导出三薪列按三薪日有效工时×2 计算"`

---

### Task 4: 前端三薪日开关 + 月历徽标

**Files:**
- Modify: `frontend/src/pages/CalendarPage.jsx`（`triplePayDates` 状态 + `handleToggleTriplePay`）
- Modify: `frontend/src/components/DayPanel.jsx`（header 增三薪日开关）
- Modify: `frontend/src/components/MonthCalendar.jsx`（`triplePayDates` prop + 徽标）
- Modify: `frontend/src/styles/global.css`（徽标 + 开关样式）

**Interfaces:**
- Consumes: `GET /api/calendar` 的 `triple_pay_dates`（list）；`PUT /api/triple-pay-days/{date}`
- Produces: `CalendarPage` 维护 `triplePayDates: Set<string>`（date key），传 `MonthCalendar` 与 `DayPanel`；`DayPanel` 增 prop `isTriplePay: bool` + `onToggleTriplePay`；`MonthCalendar` 增 prop `triplePayDates: Set<string>`

- [ ] **Step 1: 实现（前端无测试框架，用 lint + 手动验证）**：`CalendarPage` 从 `calendar?.triple_pay_dates` 派生 `triplePayDates`，`handleToggleTriplePay` 调 `PUT` 后 `refreshCalendar`；`DayPanel` header 在标题旁加「三薪日」勾选开关（`selectedDate` 存在时可用），`checked=isTriplePay`；`MonthCalendar` 对 `triplePayDates.has(cell.key)` 的格子渲染 `.month-calendar__triple-pay` 徽标；`global.css` 加徽标与开关样式。

- [ ] **Step 2: 校验** —— `cd frontend && pnpm lint`（或 `npm run lint`）预期无错误；`pnpm build` 预期成功。

- [ ] **Step 3: 手动验证** —— 打开工作日历 → 右侧面板勾选某日「三薪日」→ 月历该日出现徽标 → 刷新后状态保留 → 取消后徽标消失。

- [ ] **Step 4: Commit** —— `git add frontend/src/pages/CalendarPage.jsx frontend/src/components/DayPanel.jsx frontend/src/components/MonthCalendar.jsx frontend/src/styles/global.css && git commit -m "feat: 前端三薪日开关与月历徽标"`
