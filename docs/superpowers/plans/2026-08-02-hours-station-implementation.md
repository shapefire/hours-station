# 工时工作站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现无登录的工时登记与月度统计工作站：React 日历工作台 + FastAPI/PostgreSQL，含整日/单人复制与管理者统计看板。

**Architecture:** 前后端分离。Vite React SPA 调用 FastAPI REST；PostgreSQL 存花名册与日排班；有效工时不落库，由 `services/hours.py` 统一计算后经 schema 返回。复制与唯一性约束在服务端事务内完成。

**Tech Stack:** React 18 + Vite + React Router；FastAPI + SQLAlchemy 2 + Alembic + psycopg；PostgreSQL 16；pytest；Docker Compose（仅 Postgres）。

**Spec:** `docs/superpowers/specs/2026-08-02-hours-station-design.md`

## Global Constraints

- 无登录；打开即可用
- 工时：`raw >= 6` 则减 `0.5`，否则不减；展示保留 1 位小数；服务端计算
- 同日同人唯一：`UNIQUE (work_date, employee_id)`
- 新姓名 trim 后自动入花名册，不弹确认
- 不做跨夜班、不做导出、不做权限
- 月历一屏完整展示（最多 6 行），禁止左侧纵向滚动
- 视觉：墨绿纸感（暖灰绿底 + 墨绿强调）
- 提交说明使用中文简述（若执行中需要 commit）

## File Structure

```
hours-station/
├── docker-compose.yml          # Postgres
├── README.md
├── backend/
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/versions/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── models.py           # Employee, WorkEntry
│   │   ├── schemas.py
│   │   ├── services/
│   │   │   ├── hours.py        # pure hours calc
│   │   │   ├── employees.py
│   │   │   ├── entries.py
│   │   │   └── stats.py
│   │   └── routers/
│   │       ├── employees.py
│   │       ├── calendar.py
│   │       ├── entries.py
│   │       └── stats.py
│   └── tests/
│       ├── conftest.py
│       ├── test_hours.py
│       ├── test_entries_api.py
│       ├── test_copy_api.py
│       └── test_stats_api.py
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api/client.js
        ├── styles/tokens.css
        ├── styles/global.css
        ├── components/AppShell.jsx
        ├── components/MonthCalendar.jsx
        ├── components/DayPanel.jsx
        ├── components/EntryForm.jsx
        ├── components/PasteModeBar.jsx
        ├── pages/CalendarPage.jsx
        └── pages/StatsPage.jsx
```

---

### Task 1: 工时纯函数（TDD）+ 后端脚手架

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/hours.py`
- Create: `backend/tests/test_hours.py`
- Create: `docker-compose.yml`

**Interfaces:**
- Produces: `effective_hours(start: time, end: time) -> Decimal`（一位小数）；非法时段抛 `ValueError`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_hours.py`：

```python
from datetime import time
from decimal import Decimal
import pytest
from app.services.hours import effective_hours

def test_under_six_no_deduction():
    assert effective_hours(time(9, 0), time(14, 30)) == Decimal("5.5")

def test_exactly_six_deducts_half():
    assert effective_hours(time(9, 0), time(15, 0)) == Decimal("5.5")

def test_full_day_example():
    # 7:30-16:00 = 8.5 raw -> 8.0
    assert effective_hours(time(7, 30), time(16, 0)) == Decimal("8.0")

def test_end_not_after_start_raises():
    with pytest.raises(ValueError):
        effective_hours(time(16, 0), time(7, 30))
```

- [ ] **Step 2: 安装依赖并确认测试失败**

创建 `backend/requirements.txt`：

```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
sqlalchemy>=2.0.36
psycopg[binary]>=3.2.0
alembic>=1.14.0
pydantic>=2.10.0
pydantic-settings>=2.6.0
pytest>=8.3.0
httpx>=0.28.0
```

Run:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest tests/test_hours.py -v
```

Expected: FAIL（`ModuleNotFoundError` 或 import 失败）

- [ ] **Step 3: 实现 `effective_hours`**

```python
# backend/app/services/hours.py
from datetime import time, datetime, date
from decimal import Decimal, ROUND_HALF_UP

def effective_hours(start: time, end: time) -> Decimal:
    if end <= start:
        raise ValueError("结束时间必须晚于开始时间")
    start_dt = datetime.combine(date.min, start)
    end_dt = datetime.combine(date.min, end)
    raw = Decimal(str((end_dt - start_dt).total_seconds() / 3600))
    effective = raw - Decimal("0.5") if raw >= Decimal("6") else raw
    return effective.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
```

- [ ] **Step 4: 跑通测试**

```bash
cd backend
pytest tests/test_hours.py -v
```

Expected: PASS

- [ ] **Step 5: 添加 Postgres compose**

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: hours
      POSTGRES_PASSWORD: hours
      POSTGRES_DB: hours_station
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 6: Commit（若当前已是 git 仓库且用户要求提交）**

```bash
git add backend/docker-compose.yml backend/requirements.txt backend/app backend/tests/test_hours.py docker-compose.yml
git commit -m "实现工时计算纯函数并搭建后端基础依赖"
```

---

### Task 2: 配置、数据库、模型与迁移

**Files:**
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/app/models.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/001_initial.py`
- Create: `backend/.env.example`
- Create: `backend/tests/conftest.py`

**Interfaces:**
- Produces: `get_settings()`；`SessionLocal` / `get_db`；模型 `Employee(id, name, created_at)`、`WorkEntry(id, work_date, employee_id, start_time, end_time, note, ...)` + `UniqueConstraint(work_date, employee_id)`

- [ ] **Step 1: 配置与引擎**

```python
# backend/app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://hours:hours@localhost:5432/hours_station"
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"

def get_settings() -> Settings:
    return Settings()
```

```python
# backend/app/db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import get_settings

class Base(DeclarativeBase):
    pass

settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: 模型**

```python
# backend/app/models.py
import uuid
from datetime import datetime, date, time
from sqlalchemy import String, Date, Time, Text, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base

class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    entries: Mapped[list["WorkEntry"]] = relationship(back_populates="employee")

class WorkEntry(Base):
    __tablename__ = "work_entries"
    __table_args__ = (UniqueConstraint("work_date", "employee_id", name="uq_entry_day_employee"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    employee: Mapped[Employee] = relationship(back_populates="entries")
```

- [ ] **Step 3: 启动 DB 并生成迁移**

```bash
docker compose up -d
cd backend
# 配置 alembic env.py 使用 Base.metadata 与 database_url
alembic revision --autogenerate -m "initial"
alembic upgrade head
```

Expected: `employees`、`work_entries` 表存在

- [ ] **Step 4: pytest conftest（独立测试库或事务回滚）**

`conftest.py` 使用同一 Postgres 上的 `hours_station_test` 库，或每个测试函数 session rollback。推荐：

```python
# 创建测试库后
@pytest.fixture()
def db():
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture()
def client(db):
    from app.main import app
    from app.db import get_db
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

（`main.py` 可在本任务末尾放最小 FastAPI app，下一任务补路由。）

- [ ] **Step 5: Commit**

```bash
git add backend/app backend/alembic backend/alembic.ini backend/.env.example backend/tests/conftest.py
git commit -m "添加数据库模型与 Postgres 迁移"
```

---

### Task 3: 排班 CRUD API + 花名册 get-or-create

**Files:**
- Create: `backend/app/schemas.py`
- Create: `backend/app/services/employees.py`
- Create: `backend/app/services/entries.py`
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/routers/employees.py`
- Create: `backend/app/routers/entries.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/test_entries_api.py`

**Interfaces:**
- Consumes: `effective_hours`, models, `get_db`
- Produces:
  - `get_or_create_employee(db, name: str) -> Employee`
  - `POST /api/entries` body `{ work_date, name, start_time, end_time, note? }`
  - `GET /api/entries?date=`
  - `PATCH /api/entries/{id}`
  - `DELETE /api/entries/{id}`
  - `GET /api/employees?q=`
  - 响应字段含 `effective_hours: str`（如 `"8.0"`）

- [ ] **Step 1: 写 API 失败测试**

```python
def test_create_entry_auto_adds_employee(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
        "note": "现场",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["employee_name"] == "张三"
    assert body["effective_hours"] == "8.0"

def test_duplicate_same_day_rejected(client):
    payload = {
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    }
    assert client.post("/api/entries", json=payload).status_code == 201
    r = client.post("/api/entries", json=payload)
    assert r.status_code == 409
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pytest tests/test_entries_api.py -v
```

Expected: FAIL（路由不存在）

- [ ] **Step 3: 实现 service + router + main**

关键逻辑：

```python
def get_or_create_employee(db, name: str) -> Employee:
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("姓名不能为空")
    emp = db.query(Employee).filter(Employee.name == cleaned).one_or_none()
    if emp:
        return emp
    emp = Employee(name=cleaned)
    db.add(emp)
    db.flush()
    return emp
```

创建时调用 `effective_hours` 校验时段；捕获唯一约束 → 409。  
`main.py` 挂载路由并配置 CORS（`cors_origins` 逗号分隔）。

- [ ] **Step 4: 测试通过**

```bash
pytest tests/test_entries_api.py -v
```

Expected: PASS（含 list/patch/delete 用例，实现时一并补全测试与代码）

- [ ] **Step 5: Commit**

```bash
git commit -m "完成排班增删改查与员工自动建档 API"
```

---

### Task 4: 月历汇总 API

**Files:**
- Create: `backend/app/routers/calendar.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_entries_api.py` 或 Create: `backend/tests/test_calendar_api.py`

**Interfaces:**
- Produces: `GET /api/calendar?year=2026&month=8` →

```json
{
  "year": 2026,
  "month": 8,
  "registered_days": 2,
  "month_total_hours": "16.0",
  "days": [
    {"date": "2026-08-04", "entry_count": 1, "total_effective_hours": "8.0"}
  ]
}
```

仅包含有排班的日期；前端无数据日自行留白。

- [ ] **Step 1: 写测试（先插入两条不同日排班，断言月合计与天数）**
- [ ] **Step 2: 确认失败 → 实现聚合查询（按 `work_date` group，Python 侧累加 `effective_hours`）→ 测试通过**
- [ ] **Step 3: Commit** — `完成月历按日汇总 API`

---

### Task 5: 整日复制与单人复制 API

**Files:**
- Modify: `backend/app/services/entries.py`
- Modify: `backend/app/routers/entries.py`
- Create: `backend/tests/test_copy_api.py`

**Interfaces:**
- `POST /api/entries/copy-day` `{ "from_date": "2026-08-01", "to_date": "2026-08-02" }` → `{ "copied": 2, "skipped": 1, "skipped_names": ["张三"] }`
- `POST /api/entries/copy-person` `{ "source_entry_id": "<uuid>", "name": "赵六", "date": "2026-08-04" }` → 201 entry；重名 409；新名自动建档

- [ ] **Step 1: 写测试**

```python
def test_copy_day_skips_existing_name(client):
    # 源日两人，目标日已有其中一人 → copied=1 skipped=1
    ...

def test_copy_person_only_changes_name(client):
    # 源 entry 时段备注不变，姓名为新员工
    ...
```

- [ ] **Step 2: 失败 → 实现事务复制 → 通过**
- [ ] **Step 3: Commit** — `完成整日与单人复制 API`

---

### Task 6: 统计 API（含休息日逐日）

**Files:**
- Create: `backend/app/services/stats.py`
- Create: `backend/app/routers/stats.py`
- Create: `backend/tests/test_stats_api.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- `GET /api/stats/monthly?year=&month=` →

```json
{
  "year": 2026,
  "month": 8,
  "total_hours": "16.0",
  "employee_count": 1,
  "attendance_person_days": 2,
  "people": [
    {
      "employee_id": "...",
      "name": "张三",
      "attendance_days": 2,
      "rest_days": 29,
      "total_hours": "16.0",
      "avg_hours": "8.0"
    }
  ]
}
```

`rest_days = days_in_month - attendance_days`；`people` 按 `total_hours` 降序；只含当月有排班的人。

- `GET /api/stats/monthly/{employee_id}/days?year=&month=` → 长度 = 当月天数：

```json
{
  "days": [
    {"date": "2026-08-01", "status": "work", "start_time": "07:30", "end_time": "16:00", "effective_hours": "8.0"},
    {"date": "2026-08-02", "status": "rest", "start_time": null, "end_time": null, "effective_hours": null}
  ]
}
```

- [ ] **Step 1: 测试** — 断言 `len(days)==31`（8 月）、休息日 `status=="rest"`、汇总休息天数
- [ ] **Step 2: 实现 → PASS**
- [ ] **Step 3: Commit** — `完成月度统计与逐日休息明细 API`

---

### Task 7: 前端脚手架、设计 token、AppShell

**Files:**
- Create: `frontend/package.json`（vite react-router-dom）
- Create: `frontend/vite.config.js`（proxy `/api` → `http://127.0.0.1:8000`）
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/global.css`
- Create: `frontend/src/components/AppShell.jsx`
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/pages/CalendarPage.jsx`（占位）
- Create: `frontend/src/pages/StatsPage.jsx`（占位）

**Interfaces:**
- Produces: 路由 `/`、`/stats`；`api.get/post/patch/delete`；CSS 变量：

```css
:root {
  --bg0: #f7f6f2;
  --bg1: #eceae3;
  --ink: #1c2416;
  --muted: #5c6b52;
  --accent: #3f5d2a;
  --accent-soft: #dce8c8;
  --lime: #b8d47a;
  --rest: #8a6a3a;
  --font-display: "Source Serif 4", Georgia, serif;
  --font-body: "DM Sans", "Segoe UI", sans-serif;
}
```

- [ ] **Step 1: `npm create vite@latest frontend -- --template react` 后安装 `react-router-dom`，引入 Google fonts（Source Serif 4 + DM Sans）**
- [ ] **Step 2: 实现 AppShell（品牌 + pill 导航）与空白两页，确认 `npm run dev` 可切换**
- [ ] **Step 3: `client.js` 封装 `fetch`，统一解析错误 body**
- [ ] **Step 4: Commit** — `搭建前端壳层与墨绿纸感基础样式`

---

### Task 8: 工作日历页（月历一屏 + 日明细 CRUD）

**Files:**
- Create: `frontend/src/components/MonthCalendar.jsx`
- Create: `frontend/src/components/DayPanel.jsx`
- Create: `frontend/src/components/EntryForm.jsx`
- Modify: `frontend/src/pages/CalendarPage.jsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- Consumes: `GET /api/calendar`、`GET/POST/PATCH/DELETE /api/entries`、`GET /api/employees?q=`
- UI：左 2/3 月历（`grid-template-rows: repeat(6, 1fr)` 填满父高度，`overflow: hidden`）；右 1/3 明细；行布局姓名 | 居中时段 | 工时

- [ ] **Step 1: MonthCalendar** — 生成当月 6×7 格子；有数据示绿点+工时；选中示人数+工时；切换月
- [ ] **Step 2: DayPanel + EntryForm** — 列表、新增/编辑抽屉或内联表单、删除确认；同日重名展示后端错误
- [ ] **Step 3: CalendarPage 串联状态**（`viewYear/month`、`selectedDate`、entries、calendar summary）
- [ ] **Step 4: 手动验收** — 桌面窗口下左侧月历无需滚动即可见完整月；登记张三 7:30-16:00 显示 8.0h
- [ ] **Step 5: Commit** — `实现工作日历登记与日明细`

---

### Task 9: 复制交互（粘贴条 + 行内草稿）

**Files:**
- Create: `frontend/src/components/PasteModeBar.jsx`
- Modify: `frontend/src/pages/CalendarPage.jsx`
- Modify: `frontend/src/components/DayPanel.jsx`
- Modify: `frontend/src/components/MonthCalendar.jsx`

**Interfaces:**
- Consumes: `POST /api/entries/copy-day`、`POST /api/entries/copy-person`
- 状态：`pasteMode: { fromDate, count } | null`；`draftCopy: { sourceEntry } | null`

- [ ] **Step 1: 「复制到…」→ 显示 PasteModeBar；月历目标格可点；成功后 toast/文案提示 copied/skipped；Esc 取消**
- [ ] **Step 2: 行「复制」→ 列表底部草稿行，姓名输入（可联想 employees），完成调用 copy-person，刷新当日**
- [ ] **Step 3: 手动验收 1 号复制到 2 号；单人复制只改姓名**
- [ ] **Step 4: Commit** — `实现整日粘贴模式与单人行内复制`

---

### Task 10: 统计看板页

**Files:**
- Modify: `frontend/src/pages/StatsPage.jsx`
- Create: `frontend/src/components/StatsPeopleTable.jsx`（可选，若单文件过大则拆）

**Interfaces:**
- Consumes: `GET /api/stats/monthly`、`GET /api/stats/monthly/{id}/days`
- UI：月份切换；三项摘要；表列含休息天数；行展开逐日（休息样式用 `--rest`）

- [ ] **Step 1: 拉取并渲染汇总表（按总工时已排序）**
- [ ] **Step 2: 展开行懒加载逐日明细，断言前端渲染天数 = 当月天数**
- [ ] **Step 3: 手动验收与日历数据一致**
- [ ] **Step 4: Commit** — `实现管理者统计看板与休息日明细`

---

### Task 11: README 与本地启动验收

**Files:**
- Create: `README.md`
- Modify: `.gitignore`（确保含 `.venv`、`node_modules`、`.env`、`.superpowers/`）

- [ ] **Step 1: 写明启动步骤**

```bash
docker compose up -d
cd backend && python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt && alembic upgrade head
uvicorn app.main:app --reload --port 8000

cd frontend && npm install && npm run dev
```

- [ ] **Step 2: 端到端手测清单打勾**（登记、唯一性、复制、统计休息、月历一屏）
- [ ] **Step 3: Commit** — `补充 README 与本地运行说明`

---

## Spec Coverage Checklist（自检）

| 规格项 | 任务 |
|--------|------|
| 工时 ≥6 减 0.5 | Task 1 |
| 花名册自动加入 | Task 3 |
| 同日不重复 | Task 3 |
| 月历 + 日明细 CRUD | Task 4, 8 |
| 月历一屏不滚动 | Task 8 |
| 整日复制粘贴模式 | Task 5, 9 |
| 单人行内复制 | Task 5, 9 |
| 统计摘要 + 按人表 | Task 6, 10 |
| 逐日含休息 + 休息天数 | Task 6, 10 |
| 墨绿纸感 | Task 7 |
| Postgres 部署向 | Task 2, docker-compose |
| 无登录 | 全局（无 auth 任务） |

## Placeholder Scan

无 TBD /「另行实现」步骤；API 路径与字段与规格第 6 节对齐。

## Type Consistency

- 日期：API 用 `YYYY-MM-DD` 字符串；时间用 `HH:mm` 或 `HH:mm:ss`（Pydantic time 序列化）
- `effective_hours`：JSON 中用字符串一位小数，避免浮点误差
- 员工主键：UUID 字符串
