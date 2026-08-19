# 人事工时 Excel 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统计看板按月导出与人事模板样式一致的 Excel；花名册可维护岗位、导出姓名与拖动顺序。

**Architecture:** 仓库内 `.xlsx` 模板 + openpyxl 只改指定单元格。上下班换算为纯函数。员工表加 `export_name` / `position` / `sort_order`；店名单行设置表。导出 API 读当月全部 `work_entries` 填表后以附件下载。

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, openpyxl；React（无前端单测，以 `npm run build` + 手测）

**Spec:** `docs/superpowers/specs/2026-08-19-hr-excel-export-design.md`

## Global Constraints

- 导出 `.xlsx`，不写 `.xls`
- 不改模板边框/字号/合并/列宽/行高/填充；不改寫總計 / 总工时 / 三薪 / Rate 公式
- 日常登记短名仍用 `employees.name`
- 当月有任意登记才进表；休息/请假无加班则该日空；仅加班则按加班起止且不加 0.5
- 到岗/支援未勾没吃饭：上班 = 开始小时 + 0.5；下班 = 主结束小时 + 加班时长
- 支援列 = 该月支援有效工时之和，无支援留空
- 不足 31 天的日期列清空日期与星期，保留样式
- 文件名：`{store_name}店{月}月份.xlsx`（月为 `7` 这种不补零）
- Commit 步骤仅在用户要求提交时执行

---

## File Structure

| 文件 | 职责 |
|------|------|
| `backend/app/services/hr_export_clock.py` | `time_to_hour_number`、`clock_in_out_for_entry` |
| `backend/tests/test_hr_export_clock.py` | 上下班换算单测 |
| `backend/alembic/versions/008_employee_export_fields.py` | 员工三列 |
| `backend/alembic/versions/009_store_settings.py` | 店名表 + 默认行 |
| `backend/app/models.py` | `Employee` 新列；`StoreSettings` |
| `backend/app/schemas.py` | 员工 PATCH/reorder；店名；列表出参 |
| `backend/app/services/employees.py` | 列表排序、更新、reorder；新建 sort_order |
| `backend/app/routers/employees.py` | PATCH、PUT `/reorder` |
| `backend/app/services/settings.py` | get/put store_name |
| `backend/app/routers/settings.py` | `/store` |
| `backend/app/templates/hours_export.xlsx` | 人事表模板 |
| `backend/app/services/hr_excel_export.py` | 填模板、选人、写文件字节 |
| `backend/tests/test_hr_excel_export.py` | 表头/人选/填格 |
| `backend/app/routers/stats.py` | `GET /monthly/export` |
| `backend/tests/test_hr_excel_export_api.py` | 下载与文件名 |
| `frontend/src/components/RosterSettingsPanel.jsx` | 岗位、导出姓名、拖动 |
| `frontend/src/components/SettingsModal.jsx` | 店名 |
| `frontend/src/pages/StatsPage.jsx` | 导出按钮 |
| `frontend/src/api/client.js` | 二进制下载辅助（若需要） |
| `backend/requirements.txt` | `openpyxl` |

模板坐标（0-indexed，来自样例）：

```python
STORE_ROW, STORE_COL = 0, 2
MONTH_DATE_ROW, MONTH_DATE_COL = 0, 3
DAY_HEADER_ROW = 0
WEEKDAY_ROW = 1
DAY1_COL = 4          # 公历 1 日
TOTAL_HEADER_COL = 35
PERSON_START_ROW = 2
ROWS_PER_PERSON = 2
SEQ_COL, NAME_COL, POSITION_COL, LABEL_COL = 0, 1, 2, 3
# 支援数值列：转换模板后打印第 1–4 行 35–43 列确认；若「支援」在 (2,39) 为表头文字，数值写在每位 上班行的 SUPPORT_VALUE_COL（实现时锁定为相邻空列，常见为 40）
```

星期：`["周一","周二","周三","周四","周五","周六","周日"]`，`date.weekday()` 0=周一。

---

### Task 1: 上下班换算纯函数

**Files:**
- Create: `backend/app/services/hr_export_clock.py`
- Test: `backend/tests/test_hr_export_clock.py`

**Interfaces:**
- Produces:
  - `time_to_hour_number(t: time) -> Decimal` 一位小数
  - `excel_hour_value(value: Decimal) -> int | float` 整点变 `int`
  - `clock_in_out_for_entry(entry) -> tuple[Decimal | None, Decimal | None]`
- `entry` 至少有：`status`, `start_time`, `end_time`, `ot_start_time`, `ot_end_time`, `skip_deduction`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_hr_export_clock.py`：

```python
from datetime import time
from decimal import Decimal
from types import SimpleNamespace

from app.services.hr_export_clock import clock_in_out_for_entry, excel_hour_value, time_to_hour_number


def _e(**kwargs):
    base = dict(
        status="on_duty",
        start_time=None,
        end_time=None,
        ot_start_time=None,
        ot_end_time=None,
        skip_deduction=False,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_time_to_hour_number():
    assert time_to_hour_number(time(7, 30)) == Decimal("7.5")
    assert time_to_hour_number(time(16, 0)) == Decimal("16.0")
    assert excel_hour_value(Decimal("16.0")) == 16
    assert excel_hour_value(Decimal("7.5")) == 7.5


def test_on_duty_adds_half_hour_when_not_skip():
    inn, out = clock_in_out_for_entry(_e(
        start_time=time(7, 30), end_time=time(16, 0),
    ))
    assert inn == Decimal("8.0")
    assert out == Decimal("16.0")


def test_on_duty_skip_meal_keeps_start():
    inn, out = clock_in_out_for_entry(_e(
        start_time=time(7, 30), end_time=time(16, 0), skip_deduction=True,
    ))
    assert inn == Decimal("7.5")
    assert out == Decimal("16.0")


def test_on_duty_ot_adds_to_clock_out():
    inn, out = clock_in_out_for_entry(_e(
        start_time=time(7, 30), end_time=time(16, 0),
        ot_start_time=time(22, 0), ot_end_time=time(23, 30),
    ))
    assert inn == Decimal("8.0")
    assert out == Decimal("17.5")


def test_support_same_as_on_duty():
    inn, out = clock_in_out_for_entry(_e(
        status="support", start_time=time(11, 0), end_time=time(19, 0),
    ))
    assert inn == Decimal("11.5")
    assert out == Decimal("19.0")


def test_rest_without_ot_blank():
    assert clock_in_out_for_entry(_e(status="rest")) == (None, None)


def test_rest_ot_only_no_half_hour():
    inn, out = clock_in_out_for_entry(_e(
        status="rest", ot_start_time=time(22, 0), ot_end_time=time(23, 30),
    ))
    assert inn == Decimal("22.0")
    assert out == Decimal("23.5")


def test_on_duty_missing_main_times_blank():
    assert clock_in_out_for_entry(_e(status="on_duty")) == (None, None)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_hr_export_clock.py -q`

Expected: 收集失败（模块不存在）

- [ ] **Step 3: 最小实现**

```python
from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP

def time_to_hour_number(t: time) -> Decimal:
    raw = Decimal(t.hour) + (Decimal(t.minute) / Decimal(60))
    return raw.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def excel_hour_value(value: Decimal) -> int | float:
    q = value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    if q == q.to_integral_value():
        return int(q)
    return float(q)


def _span_hours(start: time, end: time) -> Decimal:
    start_dt = datetime.combine(date.min, start)
    end_dt = datetime.combine(date.min, end)
    raw = Decimal(str((end_dt - start_dt).total_seconds() / 3600))
    return raw.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def clock_in_out_for_entry(entry) -> tuple[Decimal | None, Decimal | None]:
    status = entry.status
    ot_start, ot_end = entry.ot_start_time, entry.ot_end_time
    ot = (
        _span_hours(ot_start, ot_end)
        if ot_start is not None and ot_end is not None
        else Decimal("0")
    )
    if status in ("rest", "leave"):
        if ot_start is None or ot_end is None:
            return None, None
        return time_to_hour_number(ot_start), time_to_hour_number(ot_end)
    start, end = entry.start_time, entry.end_time
    if start is None or end is None:
        return None, None
    start_h = time_to_hour_number(start)
    end_h = time_to_hour_number(end)
    if not getattr(entry, "skip_deduction", False):
        start_h = start_h + Decimal("0.5")
    return start_h, end_h + ot
```

- [ ] **Step 4: 再跑测试**

Run: `cd backend && python -m pytest tests/test_hr_export_clock.py -q`

Expected: PASS

- [ ] **Step 5: Commit（仅当用户要求）**

```bash
git add backend/app/services/hr_export_clock.py backend/tests/test_hr_export_clock.py
git commit -m "增加人事表上下班小时换算，供 Excel 导出使用。"
```

---

### Task 2: 员工导出字段、PATCH、排序

**Files:**
- Create: `backend/alembic/versions/008_employee_export_fields.py`
- Modify: `backend/app/models.py`（`Employee`）
- Modify: `backend/app/schemas.py`（`EmployeeOut`、`EmployeeUpdate`、`EmployeeReorderIn`）
- Modify: `backend/app/services/employees.py`
- Modify: `backend/app/routers/employees.py`
- Modify: `backend/tests/test_employees_roster.py`

**Interfaces:**
- Produces: `Employee.export_name: str | None`、`position: str | None`、`sort_order: int`
- `list_employees` 按 `sort_order, created_at`；每行含三字段
- `update_employee(db, id, fields) -> Employee`；`reorder_employees(db, ids: list[UUID]) -> None`
- 新建员工 `sort_order = max(sort_order)+1`（无行则 0）

- [ ] **Step 1: 写失败 API 测试**

追加到 `backend/tests/test_employees_roster.py`：

```python
def test_patch_employee_export_fields_and_list_order(client):
    a = client.post("/api/employees", json={"name": "苑菱"}).json()
    b = client.post("/api/employees", json={"name": "晓玲"}).json()
    r = client.patch(f"/api/employees/{a['id']}", json={
        "export_name": "伍苑菱", "position": "店经理",
    })
    assert r.status_code == 200
    assert r.json()["export_name"] == "伍苑菱"
    assert r.json()["position"] == "店经理"
    listed = client.get("/api/employees").json()
    assert [e["name"] for e in listed] == ["苑菱", "晓玲"]
    rr = client.put("/api/employees/reorder", json={"ids": [b["id"], a["id"]]})
    assert rr.status_code == 204
    listed = client.get("/api/employees").json()
    assert [e["name"] for e in listed] == ["晓玲", "苑菱"]


def test_patch_employee_rejects_overlong(client):
    emp = client.post("/api/employees", json={"name": "苑菱"}).json()
    r = client.patch(f"/api/employees/{emp['id']}", json={"position": "岗" * 65})
    assert r.status_code == 400
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_employees_roster.py::test_patch_employee_export_fields_and_list_order -q`

Expected: 404 或 schema 无字段

- [ ] **Step 3: 迁移**

`008_employee_export_fields.py`：`revision = "008_employee_export_fields"`，`down_revision = "007_skip_deduction"`。

```python
def upgrade() -> None:
    op.add_column("employees", sa.Column("export_name", sa.String(64), nullable=True))
    op.add_column("employees", sa.Column("position", sa.String(64), nullable=True))
    op.add_column(
        "employees",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

def downgrade() -> None:
    op.drop_column("employees", "sort_order")
    op.drop_column("employees", "position")
    op.drop_column("employees", "export_name")
```

`Employee` 增加对应 `mapped_column`。测试库靠 `create_all`，不必在测试里跑 alembic，但文件必须存在。

- [ ] **Step 4: schema + service + router**

`EmployeeOut` 增加 `export_name: str | None = None`、`position: str | None = None`、`sort_order: int = 0`。

```python
class EmployeeUpdate(BaseModel):
    export_name: str | None = None
    position: str | None = None

class EmployeeReorderIn(BaseModel):
    ids: list[UUID]
```

`list_employees`：`order_by(Employee.sort_order, Employee.created_at)`；row 带上三字段。

`get_or_create_employee` 新建时：

```python
max_order = db.scalar(select(func.coalesce(func.max(Employee.sort_order), -1))) or -1
emp = Employee(name=cleaned, is_active=True, sort_order=int(max_order) + 1)
```

`update_employee`：空串当 `None`；`len > 64` → `ValueError`。`reorder_employees`：`ids` 必须恰好覆盖全部 `is_active` 员工，否则 `ValueError("排序名单与花名册不一致")`；按索引写 `sort_order`。

Router：`PUT /reorder` 须注册在 `/{employee_id}` 之前。PATCH 404/`ValueError`→400。

- [ ] **Step 5: 跑测试**

Run: `cd backend && python -m pytest tests/test_employees_roster.py -q`

Expected: PASS。本地再 `python -m alembic upgrade head`。

- [ ] **Step 6: Commit（仅当用户要求）**

```bash
git add backend/alembic/versions/008_employee_export_fields.py backend/app/models.py backend/app/schemas.py backend/app/services/employees.py backend/app/routers/employees.py backend/tests/test_employees_roster.py
git commit -m "花名册支持岗位、导出姓名和拖动顺序，供人事表导出。"
```

---

### Task 3: 店名设置

**Files:**
- Create: `backend/alembic/versions/009_store_settings.py`
- Modify: `backend/app/models.py`、`schemas.py`、`services/settings.py`、`routers/settings.py`
- Create: `backend/tests/test_store_settings_api.py`

**Interfaces:**
- Produces: 表 `store_settings(id INTEGER PK, store_name VARCHAR(64) NOT NULL)`，插入 `id=1, store_name='东圃地铁站'`
- `get_store_name(db) -> str`；`put_store_name(db, name: str) -> str`
- `GET/PUT /api/settings/store` body `{ "store_name": "东圃地铁站" }`

- [ ] **Step 1: 写失败测试**

```python
def test_store_name_default_and_update(client):
    r = client.get("/api/settings/store")
    assert r.status_code == 200
    assert r.json()["store_name"] == "东圃地铁站"
    u = client.put("/api/settings/store", json={"store_name": " 东圃地铁站 "})
    assert u.status_code == 200
    assert u.json()["store_name"] == "东圃地铁站"
    bad = client.put("/api/settings/store", json={"store_name": ""})
    assert bad.status_code == 400
```

测试 `create_all` 不会自动插入默认行，因此 **service 在 get 时若无行则创建默认**（迁移负责生产库插入；测试走 get 的 upsert）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_store_settings_api.py -q`

Expected: FAIL

- [ ] **Step 3: 实现**

模型：

```python
class StoreSettings(Base):
    __tablename__ = "store_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_name: Mapped[str] = mapped_column(String(64), nullable=False)
```

`get_store_name`：无 `id=1` 则插入默认。`put_store_name`：`strip`，空或 >64 → `ValueError`。

`conftest.py` 已 `from app.models import ...`，补上 `StoreSettings` 以便 `create_all`。

- [ ] **Step 4: 跑测试**

Run: `cd backend && python -m pytest tests/test_store_settings_api.py tests/test_employees_roster.py -q`

Expected: PASS

- [ ] **Step 5: Commit（仅当用户要求）**

```bash
git add backend/alembic/versions/009_store_settings.py backend/app/models.py backend/app/schemas.py backend/app/services/settings.py backend/app/routers/settings.py backend/tests/test_store_settings_api.py backend/tests/conftest.py
```

路径是 `backend/tests/test_store_settings_api.py`。

```bash
git commit -m "增加店名设置，供人事 Excel 表头与文件名使用。"
```

---

### Task 4: 纳入 `.xlsx` 模板

**Files:**
- Create: `backend/app/templates/hours_export.xlsx`
- Create: `backend/app/services/hr_excel_layout.py`（坐标常量 + 支援列探测结果写成常量）

**Interfaces:**
- Produces: 模板文件；`hr_excel_layout.py` 中的行列常量（含最终 `SUPPORT_VALUE_COL`）

- [ ] **Step 1: 转换样例表**

源文件：`f:\RecordTmp\东圃地铁站店7月份.xls`。优先：

```bash
soffice --headless --convert-to xlsx --outdir backend/app/templates "f:\RecordTmp\东圃地铁站店7月份.xls"
```

将生成文件重命名为 `hours_export.xlsx`。若无 LibreOffice，用 Excel 另存为 xlsx 后拷入同一路径。不要手动画一张「像」的表。

- [ ] **Step 2: 打印关键格，锁定支援列**

```python
from openpyxl import load_workbook
wb = load_workbook("backend/app/templates/hours_export.xlsx")
ws = wb.active
for r in range(1, 5):
    for c in range(1, 45):
        v = ws.cell(r, c).value
        if v not in (None, ""):
            print(r, c, v)
```

确认：店名约 `C1`，月份日期 `D1`，1 日为第 5 列（openpyxl 1-based = 0-indexed 4）。找到每人「支援」工时应写入的列，写入 `SUPPORT_VALUE_COL`（0-indexed）。**不要覆盖「总工时」「三薪」「Rate」表头文字所在格，除非那格本身就是数值槽。**

- [ ] **Step 3: `hr_excel_layout.py` 写死常量**

把探测结果写成命名常量（含 `TEMPLATE_PATH` 指向该 xlsx）。人员槽：模板里已有序号的成对行数（样例约 15 对，以实际为准）写成 `TEMPLATE_PERSON_SLOTS`。

- [ ] **Step 4: Commit（仅当用户要求）**

```bash
git add backend/app/templates/hours_export.xlsx backend/app/services/hr_excel_layout.py
git commit -m "纳入人事工时 Excel 模板及行列坐标。"
```

---

### Task 5: 填表服务

**Files:**
- Create: `backend/app/services/hr_excel_export.py`
- Modify: `backend/requirements.txt`（`openpyxl>=3.1.0`）
- Test: `backend/tests/test_hr_excel_export.py`

**Interfaces:**
- Consumes: Task 1 换算；Task 2 员工字段；Task 3 店名；Task 4 模板
- Produces:
  - `list_export_employees(db, year, month) -> list[Employee]` 当月有任意 entry，顺序 `sort_order, created_at`
  - `build_export_workbook(db, year, month) -> bytes`
  - `export_filename(store_name: str, month: int) -> str`

填表规则：

1. `load_workbook(TEMPLATE_PATH)` 复制内存
2. 写店名、当月 1 日（`datetime.date`，单元格已有日期格式则只改值）
3. 对 `d in 1..days_in_month`：`DAY_HEADER_ROW, DAY1_COL+d-1` 写 `d`；星期行写周×。超出天数：这两格 `value = None`
4. 列出导出员工。对第 i 人（0-based）：`row = PERSON_START_ROW + i*2`。若 `i >= TEMPLATE_PERSON_SLOTS`：复制上一对两行的单元格样式（`copy` from `copy(cell.font)` 等，或 `copy_worksheet` 行）追加。
5. 上班行：序号 `i+1`、姓名 `export_name or name`、岗位、日格用 `excel_hour_value`；下班行只写日格。无值写 `None`。
6. 支援合计：`sum(entry_hours_decimal(e) for e in month if status==support)`；`>0` 写一位小数数字到 `SUPPORT_VALUE_COL` 上班行，否则 `None`
7. `i >= len(people)` 且 `i < TEMPLATE_PERSON_SLOTS`：清空序号/姓名/岗位/日值/支援，**保留「上班」「下班」标签**
8. 不写 TOTAL / 总工时 / 三薪 / Rate 公式格

- [ ] **Step 1: 写失败测试**

`backend/tests/test_hr_excel_export.py` 用 `client` 造数据后调 `build_export_workbook`（或先测 `list_export_employees` + 用临时 xlsx）。优先对真实模板：

```python
from datetime import date
from io import BytesIO
from openpyxl import load_workbook
from app.services.hr_excel_export import build_export_workbook, export_filename
from app.services.hr_excel_layout import DAY1_COL, WEEKDAY_ROW, PERSON_START_ROW, NAME_COL

def test_export_filename():
    assert export_filename("东圃地铁站", 7) == "东圃地铁站店7月份.xlsx"

def test_february_headers_and_blank_extra_days(db):
    raw = build_export_workbook(db, 2026, 2)
    ws = load_workbook(BytesIO(raw)).active
    # openpyxl 1-based
    day1_col = DAY1_COL + 1
    assert ws.cell(1, day1_col).value == 1
    # 2026-02-01 周日
    assert ws.cell(WEEKDAY_ROW + 1, day1_col).value == "周日"
    assert ws.cell(1, day1_col + 27).value == 28
    assert ws.cell(1, day1_col + 28).value in (None, "")
    assert ws.cell(WEEKDAY_ROW + 1, day1_col + 28).value in (None, "")

def test_only_registered_people_in_sort_order(client, db):
    zhang = client.post("/api/employees", json={"name": "张三"}).json()
    li = client.post("/api/employees", json={"name": "李四"}).json()
    client.put("/api/employees/reorder", json={"ids": [li["id"], zhang["id"]]})
    client.patch(f"/api/employees/{li['id']}", json={"export_name": "李四全", "position": "全职"})
    client.post("/api/entries", json={
        "work_date": "2026-08-01", "name": "李四",
        "start_time": "07:30", "end_time": "16:00",
    })
    # 张三当月无登记
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    first_name_row = PERSON_START_ROW + 1  # openpyxl 1-based
    assert ws.cell(first_name_row, NAME_COL + 1).value == "李四全"
    second_name_row = PERSON_START_ROW + 2 + 1
    assert ws.cell(second_name_row, NAME_COL + 1).value in (None, "")

def test_duty_cells_and_support_column(client, db):
    client.post("/api/entries", json={
        "work_date": "2026-08-01", "name": "苑菱",
        "start_time": "07:30", "end_time": "16:00",
        "ot_start_time": "22:00", "ot_end_time": "23:30",
    })
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    from app.services.hr_excel_layout import DAY1_COL, PERSON_START_ROW
    on_cell = ws.cell(PERSON_START_ROW + 1, DAY1_COL + 1).value
    off_cell = ws.cell(PERSON_START_ROW + 2, DAY1_COL + 1).value
    assert on_cell in (8, 8.0)
    assert off_cell in (17.5, 17.50)
```

修正 `next_name` 那行：下一人员上班行是 `PERSON_START_ROW + ROWS_PER_PERSON`（0-indexed）→ openpyxl 行 `PERSON_START_ROW + ROWS_PER_PERSON + 1`。

再加：休息+加班、纯休息空、支援日+支援列。用 `client` 造 entry 后读格。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_hr_excel_export.py -q`

Expected: FAIL

- [ ] **Step 3: 实现 `hr_excel_export.py`**

`build_export_workbook` 用 `BytesIO` + `wb.save`。查询：

```python
month_start = date(year, month, 1)
month_end = date(year, month, monthrange(year, month)[1])
entries = db.scalars(
    select(WorkEntry).options(joinedload(WorkEntry.employee)).where(
        WorkEntry.work_date >= month_start,
        WorkEntry.work_date <= month_end,
    )
).unique().all()
```

按 `employee_id` 分组；员工集合按 `sort_order, created_at`。复制行样式用 `copy(src_cell._style)` 或逐项 copy font/border/fill/alignment/number_format。

- [ ] **Step 4: 跑测试**

Run: `cd backend && python -m pytest tests/test_hr_excel_export.py tests/test_hr_export_clock.py -q`

Expected: PASS

- [ ] **Step 5: Commit（仅当用户要求）**

```bash
git add backend/requirements.txt backend/app/services/hr_excel_export.py backend/tests/test_hr_excel_export.py
git commit -m "按人事模板填写月度上下班与支援工时。"
```

---

### Task 6: 导出 HTTP

**Files:**
- Modify: `backend/app/routers/stats.py`
- Test: `backend/tests/test_hr_excel_export_api.py`

**Interfaces:**
- Produces: `GET /api/stats/monthly/export?year=&month=`
- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Disposition: attachment; filename="东圃地铁站店7月份.xlsx"`（非 ASCII 文件名同时给 `filename*=UTF-8''` 编码）

- [ ] **Step 1: 写失败测试**

```python
from urllib.parse import unquote

def test_export_download_headers(client):
    client.post("/api/entries", json={
        "work_date": "2026-07-02", "name": "苑菱",
        "start_time": "08:00", "end_time": "16:00",
    })
    r = client.get("/api/stats/monthly/export", params={"year": 2026, "month": 7})
    assert r.status_code == 200
    assert "spreadsheetml.sheet" in r.headers["content-type"]
    cd = r.headers.get("content-disposition", "")
    assert "7月份.xlsx" in unquote(cd)
    assert r.content[:2] == b"PK"
```

空月同样 200。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_hr_excel_export_api.py -q`

Expected: 404

- [ ] **Step 3: router**

用 `Response(content=raw, media_type=..., headers={"Content-Disposition": ...})`。`filename*` 用 `urllib.parse.quote`。路由挂在 `/monthly/{employee_id}/days` **之前**，路径用 `/monthly/export` 以免 `export` 被当成 UUID。

- [ ] **Step 4: 跑测试**

Run: `cd backend && python -m pytest tests/test_hr_excel_export_api.py tests/test_hr_excel_export.py -q`

Expected: PASS

- [ ] **Step 5: Commit（仅当用户要求）**

```bash
git add backend/app/routers/stats.py backend/tests/test_hr_excel_export_api.py
git commit -m "统计看板提供按月下载人事 Excel 的接口。"
```

---

### Task 7: 前端花名册、店名、导出按钮

**Files:**
- Modify: `frontend/src/components/RosterSettingsPanel.jsx`
- Modify: `frontend/src/components/SettingsModal.jsx`
- Modify: `frontend/src/pages/StatsPage.jsx`
- Modify: `frontend/src/styles/global.css`（花名册行：岗位/导出姓名输入、拖动手柄，最小改动）
- Modify: `frontend/src/api/client.js`（增加 `download` 或页面内 `fetch` blob）

**Interfaces:**
- Consumes: PATCH employee、PUT reorder、GET/PUT store、GET export
- 花名册每行：日常姓名（只读）+ 岗位 input + 导出姓名 input（blur 即 PATCH）+ `draggable`，`onDragEnd` 后 `PUT /api/employees/reorder`
- 设置「工时计算」旁或花名册顶增加店名（也可放工时计算区顶部）：加载 GET store，保存 PUT
- 统计看板 `h1` 旁按钮「导出 Excel」；busy 时禁用；失败写入现有 `error` banner
- 下载：`fetch` + `blob` + `<a download>`；文件名优先解析 `Content-Disposition`，否则回退 `{year}年{month}月.xlsx`

- [ ] **Step 1: 花名册 UI**

每项结构示例：

```jsx
<li draggable={!busy} onDragStart=... onDragOver=... onDrop=...>
  <span className="roster-drag" aria-hidden>⋮⋮</span>
  <span>{emp.name}</span>
  <input aria-label={`${emp.name} 岗位`} value={emp.position || ''} onBlur={savePatch} />
  <input aria-label={`${emp.name} 导出姓名`} value={emp.export_name || ''} placeholder="导出全名" onBlur={savePatch} />
  ...
</li>
```

本地 state 在拖动时立即重排，再请求 reorder；失败则 `loadRoster()` 回滚。

- [ ] **Step 2: 店名**

`SettingsModal` 增加区块（可放在花名册 section 顶部）：标签「店名」，默认显示加载结果。

- [ ] **Step 3: 导出按钮**

放在 `stats-page__nav` 内、下一月按钮之后（或 subtitle 一行右侧）。不要挡住月份翻页。

- [ ] **Step 4: `npm run build`**

Run: `cd frontend && npm run build`

Expected: 成功

- [ ] **Step 5: Commit（仅当用户要求）**

```bash
git add frontend/src/components/RosterSettingsPanel.jsx frontend/src/components/SettingsModal.jsx frontend/src/pages/StatsPage.jsx frontend/src/styles/global.css frontend/src/api/client.js
git commit -m "设置可维护岗位与店名，统计看板可下载人事 Excel。"
```

---

### Task 8: 手测

- [ ] 花名册拖动后刷新顺序仍在；导出姓名空则表里用短名
- [ ] 导出 8 月：表头星期与日历一致；`7:30–16:00` 未勾没吃饭 → 8 / 16；勾了 → 7.5 / 16；加班 1.5 → 下班 +1.5
- [ ] 休息日空；休息+加班填 22 / 23.5
- [ ] 支援日有上下班，支援列有数；无支援空
- [ ] 2 月 29–31 列无日期无星期
- [ ] 總計等公式格未被数字覆盖；边框看起来与原表一致
- [ ] 当月无登记仍能下载

---

## Self-review vs spec

| 规格 | 任务 |
|------|------|
| 模板填数、样式不动 | T4–T5 |
| 日期星期对齐、不足 31 天空列 | T5 |
| 有登记才导出、入职前空 | T5 |
| 岗位、导出姓名、拖动顺序 | T2、T7 |
| 上下班换算、休息加班、支援列 | T1、T5 |
| 店名、文件名 | T3、T6 |
| 统计看板入口 | T6、T7 |
| 不改合計公式 | T5 明确不写那些列 |

无 TBD。常量名 `SUPPORT_VALUE_COL` 在 T4 探测后锁定，后续任务必须用同一名字。
