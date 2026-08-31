# 员工月度工时核审与异议审核 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 员工凭姓名核审近月逐日时段并可按天提异议（主时段+加班）；整月确认锁定；管理员逐条确认/无效，确认后将该日写成到岗并更新时段。

**Architecture:** 新增 `monthly_reviews` + `time_disputes` 表与 `/api/reviews` 路由；确认落库复用 `entries.create_entry` / `update_entry`。前端独立页 `/review`、`/review/admin`，顶栏增加导航入口。无登录，姓名匹配花名册。

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, React, Vite, react-router-dom

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-31-employee-timesheet-review-design.md`
- 身份：仅花名册姓名；不引入登录/权限
- 异议字段：主时段必填成对；加班成对或双空（双空=清除）；备注可选
- 可异议：当月每一天（含未安排）
- 确认落库：一律 `on_duty`；有记录则更新，无则新建；**按单条 dispute id**，不影响其他天
- 默认月份：`today.day == 1` → 上月，否则当前月；可选月份仅「默认月 ∪ 当前月」
- 提交后该员工该月锁定，不可再提交
- 提交信息用中文总结；**仅在用户要求时 commit**（plan 中 commit 步默认可跳过）

## File Map

| 文件 | 职责 |
|------|------|
| `backend/app/models.py` | `MonthlyReview`、`TimeDispute` |
| `backend/alembic/versions/010_timesheet_reviews.py` | 建表 migration |
| `backend/app/schemas.py` | Review API 入参/出参 |
| `backend/app/services/reviews.py` | 月明细、提交、列表、确认、无效 |
| `backend/app/routers/reviews.py` | HTTP 路由 |
| `backend/app/main.py` | `include_router` |
| `backend/tests/test_reviews_api.py` | API 测试 |
| `frontend/src/pages/EmployeeReviewPage.jsx` | 员工核审页 |
| `frontend/src/pages/AdminDisputesPage.jsx` | 管理员异议审核页 |
| `frontend/src/utils/reviewMonth.js` | 默认月算法 |
| `frontend/src/App.jsx` | 路由 |
| `frontend/src/components/AppShell.jsx` | 导航 |
| `frontend/src/styles/global.css` | 核审/审核页样式 |

---

### Task 1: Models + migration

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/010_timesheet_reviews.py`

**Interfaces:**
- Produces: ORM `MonthlyReview`, `TimeDispute`；表 `monthly_reviews`、`time_disputes`

- [ ] **Step 1: 在 `models.py` 追加模型**

在 `StoreSettings` 之后追加：

```python
class MonthlyReview(Base):
    __tablename__ = "monthly_reviews"
    __table_args__ = (
        UniqueConstraint("employee_id", "year", "month", name="uq_monthly_review_emp_ym"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TimeDispute(Base):
    __tablename__ = "time_disputes"
    __table_args__ = (
        UniqueConstraint("employee_id", "work_date", name="uq_time_dispute_emp_day"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False, index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    entry_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("work_entries.id"), nullable=True)
    original_status: Mapped[str] = mapped_column(String(16), nullable=False)
    original_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    original_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    original_ot_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    original_ot_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    proposed_start_time: Mapped[time] = mapped_column(Time, nullable=False)
    proposed_end_time: Mapped[time] = mapped_column(Time, nullable=False)
    proposed_ot_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    proposed_ot_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", server_default="pending")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_entry_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("work_entries.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 2: 写 Alembic migration `010_timesheet_reviews.py`**

```python
"""monthly_reviews and time_disputes

Revision ID: 010_timesheet_reviews
Revises: 009_store_settings
Create Date: 2026-08-31
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "010_timesheet_reviews"
down_revision: Union[str, Sequence[str], None] = "009_store_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "monthly_reviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "year", "month", name="uq_monthly_review_emp_ym"),
    )
    op.create_table(
        "time_disputes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("entry_id", sa.Uuid(), nullable=True),
        sa.Column("original_status", sa.String(length=16), nullable=False),
        sa.Column("original_start_time", sa.Time(), nullable=True),
        sa.Column("original_end_time", sa.Time(), nullable=True),
        sa.Column("original_ot_start_time", sa.Time(), nullable=True),
        sa.Column("original_ot_end_time", sa.Time(), nullable=True),
        sa.Column("proposed_start_time", sa.Time(), nullable=False),
        sa.Column("proposed_end_time", sa.Time(), nullable=False),
        sa.Column("proposed_ot_start_time", sa.Time(), nullable=True),
        sa.Column("proposed_ot_end_time", sa.Time(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_entry_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["entry_id"], ["work_entries.id"]),
        sa.ForeignKeyConstraint(["resolved_entry_id"], ["work_entries.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "work_date", name="uq_time_dispute_emp_day"),
    )
    op.create_index("ix_time_disputes_employee_id", "time_disputes", ["employee_id"])
    op.create_index("ix_time_disputes_work_date", "time_disputes", ["work_date"])


def downgrade() -> None:
    op.drop_index("ix_time_disputes_work_date", table_name="time_disputes")
    op.drop_index("ix_time_disputes_employee_id", table_name="time_disputes")
    op.drop_table("time_disputes")
    op.drop_table("monthly_reviews")
```

说明：若本仓库 UUID 列惯用 `sa.GUID()` / `postgresql.UUID`，与 `009` 之前 migration 保持一致，不要混用。

- [ ] **Step 3: 本地升级（开发库）**

Run: 启动后端一次或 `cd backend; alembic upgrade head`  
Expected: 无报错，两表存在

- [ ] **Step 4: Commit（仅用户要求时）**

```bash
git add backend/app/models.py backend/alembic/versions/010_timesheet_reviews.py
git commit -m "数据模型：月度核审与工时异议表。"
```

---

### Task 2: Schemas + service 月明细与提交（TDD）

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/services/reviews.py`
- Create: `backend/app/routers/reviews.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_reviews_api.py`

**Interfaces:**
- Produces:
  - `get_employee_month(db, *, name: str, year: int, month: int) -> dict`
  - `submit_monthly_review(db, *, name: str, year: int, month: int, disputes: list[dict]) -> dict`
  - Router prefix `/api/reviews`

- [ ] **Step 1: 写失败测试 `test_reviews_api.py`**

```python
from datetime import date


def _seed_duty(client, day="2026-08-10"):
    r = client.post("/api/entries", json={
        "work_date": day,
        "name": "核审甲",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "17:00",
        "ot_start_time": "17:00",
        "ot_end_time": "18:00",
    })
    assert r.status_code == 201
    return r.json()


def test_employee_month_requires_existing_name(client):
    r = client.get("/api/reviews/employee-month", params={
        "name": "不存在的人", "year": 2026, "month": 8,
    })
    assert r.status_code == 404


def test_employee_month_lists_days_and_ot(client):
    _seed_duty(client)
    r = client.get("/api/reviews/employee-month", params={
        "name": "核审甲", "year": 2026, "month": 8,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["reviewed"] is False
    day = next(d for d in body["days"] if d["date"] == "2026-08-10")
    assert day["status"] == "on_duty"
    assert day["start_time"] == "08:00"
    assert day["end_time"] == "17:00"
    assert day["ot_start_time"] == "17:00"
    assert day["ot_end_time"] == "18:00"


def test_submit_locks_month_and_creates_disputes(client):
    _seed_duty(client)
    r = client.post("/api/reviews/submit", json={
        "name": "核审甲",
        "year": 2026,
        "month": 8,
        "disputes": [{
            "work_date": "2026-08-10",
            "proposed_start_time": "09:00",
            "proposed_end_time": "18:00",
            "proposed_ot_start_time": None,
            "proposed_ot_end_time": None,
            "note": "实际无加班",
        }],
    })
    assert r.status_code == 200
    assert r.json()["dispute_count"] == 1

    again = client.post("/api/reviews/submit", json={
        "name": "核审甲", "year": 2026, "month": 8, "disputes": [],
    })
    assert again.status_code == 409

    month = client.get("/api/reviews/employee-month", params={
        "name": "核审甲", "year": 2026, "month": 8,
    }).json()
    assert month["reviewed"] is True
    assert len(month["disputes"]) == 1
    assert month["disputes"][0]["status"] == "pending"


def test_submit_rejects_incomplete_ot_pair(client):
    _seed_duty(client)
    r = client.post("/api/reviews/submit", json={
        "name": "核审甲",
        "year": 2026,
        "month": 8,
        "disputes": [{
            "work_date": "2026-08-11",
            "proposed_start_time": "08:00",
            "proposed_end_time": "16:00",
            "proposed_ot_start_time": "16:00",
            "proposed_ot_end_time": None,
            "note": None,
        }],
    })
    assert r.status_code == 400
```

- [ ] **Step 2: Run 确认失败**

Run: `cd backend; python -m pytest tests/test_reviews_api.py -q`  
Expected: FAIL（路由/模块不存在）

- [ ] **Step 3: 追加 schemas（`schemas.py` 末尾）**

```python
class ReviewDayOut(BaseModel):
    date: date
    status: str  # on_duty|rest|leave|support|unassigned
    start_time: time | None = None
    end_time: time | None = None
    ot_start_time: time | None = None
    ot_end_time: time | None = None
    entry_id: UUID | None = None


class ReviewDisputeOut(BaseModel):
    id: UUID
    work_date: date
    status: str
    original_status: str
    original_start_time: time | None = None
    original_end_time: time | None = None
    original_ot_start_time: time | None = None
    original_ot_end_time: time | None = None
    proposed_start_time: time
    proposed_end_time: time
    proposed_ot_start_time: time | None = None
    proposed_ot_end_time: time | None = None
    note: str | None = None


class EmployeeMonthReviewOut(BaseModel):
    employee_id: UUID
    name: str
    year: int
    month: int
    reviewed: bool
    confirmed_at: datetime | None = None
    days: list[ReviewDayOut]
    disputes: list[ReviewDisputeOut] = Field(default_factory=list)


class ReviewDisputeIn(BaseModel):
    work_date: date
    proposed_start_time: time
    proposed_end_time: time
    proposed_ot_start_time: time | None = None
    proposed_ot_end_time: time | None = None
    note: str | None = None


class ReviewSubmitIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    year: int = Field(..., ge=1)
    month: int = Field(..., ge=1, le=12)
    disputes: list[ReviewDisputeIn] = Field(default_factory=list)


class ReviewSubmitOut(BaseModel):
    reviewed: bool
    dispute_count: int
```

（按文件顶部已有 import 补齐 `datetime`、`UUID`、`Field`。）

- [ ] **Step 4: 实现 `services/reviews.py`（月明细 + 提交）**

要点：

```python
def _require_employee(db, name: str) -> Employee:
    cleaned = name.strip()
    emp = db.scalars(select(Employee).where(Employee.name == cleaned)).one_or_none()
    if emp is None:
        raise KeyError("员工不存在")
    return emp


def _validate_proposed_times(start, end, ot_start, ot_end) -> None:
    if start is None or end is None:
        raise ValueError("到岗必须填写开始与结束时间")
    format_effective_hours(start, end)  # from entries
    _normalize_ot_times(ot_start, ot_end)  # from entries — 双空 OK，单边 ValueError


def get_employee_month(...):
    # 逐日：有 WorkEntry 则用 DB status + 时段 + ot + entry_id
    # 无则 status=unassigned；reviewed 看 MonthlyReview；disputes 查 TimeDispute


def submit_monthly_review(...):
    # 已有 MonthlyReview → raise LookupError("该月已核审") 或自定义；router → 409
    # 校验每个 dispute 的 proposed times；work_date 必须落在 year/month
    # 快照当日 entry（无则 original_status=unassigned, entry_id=None）
    # 事务内：add MonthlyReview；add 全部 TimeDispute(status=pending)
```

错误映射约定：`KeyError`→404，`ValueError`→400，`LookupError`（已核审）→409。

- [ ] **Step 5: 实现 router 并挂载**

`routers/reviews.py`：

```python
router = APIRouter(prefix="/api/reviews", tags=["reviews"])

@router.get("/employee-month", response_model=EmployeeMonthReviewOut)
def employee_month(name: str = Query(...), year: int = Query(..., ge=1), month: int = Query(..., ge=1, le=12), db: Session = Depends(get_db)):
    try:
        return get_employee_month(db, name=name, year=year, month=month)
    except KeyError as exc:
        raise HTTPException(404, detail=str(exc.args[0])) from exc

@router.post("/submit", response_model=ReviewSubmitOut)
def submit(payload: ReviewSubmitIn, db: Session = Depends(get_db)):
    try:
        return submit_monthly_review(db, **payload.model_dump())
    except KeyError as exc:
        raise HTTPException(404, detail=str(exc.args[0])) from exc
    except LookupError as exc:
        raise HTTPException(409, detail=str(exc.args[0])) from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc.args[0])) from exc
```

`main.py`：`from app.routers import reviews` + `app.include_router(reviews.router)`。

- [ ] **Step 6: Run 测试通过**

Run: `cd backend; python -m pytest tests/test_reviews_api.py -q`  
Expected: PASS（本 Task 已写用例）

- [ ] **Step 7: Commit（仅用户要求时）**

```bash
git commit -m "接口：员工月度核审查询与提交锁定。"
```

---

### Task 3: 确认 / 无效 API（TDD）

**Files:**
- Modify: `backend/app/services/reviews.py`
- Modify: `backend/app/routers/reviews.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/tests/test_reviews_api.py`

**Interfaces:**
- Produces:
  - `list_disputes(db, *, status: str | None, year: int | None, month: int | None) -> list[dict]`
  - `confirm_dispute(db, dispute_id: UUID) -> dict`
  - `reject_dispute(db, dispute_id: UUID) -> dict`

- [ ] **Step 1: 追加失败测试**

```python
def test_confirm_updates_one_day_only(client):
    _seed_duty(client, "2026-08-10")
    client.post("/api/entries", json={
        "work_date": "2026-08-12", "name": "核审甲",
        "status": "on_duty", "start_time": "08:00", "end_time": "16:00",
    })
    client.post("/api/reviews/submit", json={
        "name": "核审甲", "year": 2026, "month": 8,
        "disputes": [
            {
                "work_date": "2026-08-10",
                "proposed_start_time": "09:00",
                "proposed_end_time": "18:00",
                "proposed_ot_start_time": None,
                "proposed_ot_end_time": None,
                "note": "清加班",
            },
            {
                "work_date": "2026-08-12",
                "proposed_start_time": "10:00",
                "proposed_end_time": "19:00",
                "proposed_ot_start_time": "19:00",
                "proposed_ot_end_time": "20:00",
                "note": None,
            },
        ],
    })
    pending = client.get("/api/reviews/disputes", params={"status": "pending"}).json()
    d10 = next(d for d in pending if d["work_date"] == "2026-08-10")
    d12 = next(d for d in pending if d["work_date"] == "2026-08-12")

    ok = client.post(f"/api/reviews/disputes/{d10['id']}/confirm")
    assert ok.status_code == 200

    entries = {e["work_date"]: e for e in client.get("/api/entries", params={"date": "2026-08-10"}).json()}
    # list by date returns that day only — also fetch 12
    e10 = client.get("/api/entries", params={"date": "2026-08-10"}).json()
    row10 = next(e for e in e10 if e["employee_name"] == "核审甲")
    assert row10["start_time"] == "09:00"
    assert row10["end_time"] == "18:00"
    assert row10["ot_start_time"] is None
    assert row10["status"] == "on_duty"

    e12 = client.get("/api/entries", params={"date": "2026-08-12"}).json()
    row12 = next(e for e in e12 if e["employee_name"] == "核审甲")
    assert row12["start_time"] == "08:00"  # 未确认，未改

    still = client.get("/api/reviews/disputes", params={"status": "pending"}).json()
    assert any(d["id"] == d12["id"] for d in still)


def test_confirm_creates_entry_for_unassigned_day(client):
    client.post("/api/employees", json={"name": "核审乙"})  # 若无此 API，用 entries 先建其他日
    # 更稳妥：先建 8/1 到岗以创建员工，再对未安排日异议
    client.post("/api/entries", json={
        "work_date": "2026-08-01", "name": "核审乙",
        "status": "on_duty", "start_time": "08:00", "end_time": "16:00",
    })
    client.post("/api/reviews/submit", json={
        "name": "核审乙", "year": 2026, "month": 8,
        "disputes": [{
            "work_date": "2026-08-20",
            "proposed_start_time": "08:00",
            "proposed_end_time": "17:00",
            "proposed_ot_start_time": "17:00",
            "proposed_ot_end_time": "18:30",
            "note": "漏登记",
        }],
    })
    d = client.get("/api/reviews/disputes", params={"status": "pending"}).json()[0]
    assert client.post(f"/api/reviews/disputes/{d['id']}/confirm").status_code == 200
    rows = client.get("/api/entries", params={"date": "2026-08-20"}).json()
    row = next(e for e in rows if e["employee_name"] == "核审乙")
    assert row["status"] == "on_duty"
    assert row["ot_end_time"] == "18:30"


def test_reject_does_not_change_entry(client):
    _seed_duty(client, "2026-08-15")
    client.post("/api/reviews/submit", json={
        "name": "核审甲", "year": 2026, "month": 8,
        "disputes": [{
            "work_date": "2026-08-15",
            "proposed_start_time": "10:00",
            "proposed_end_time": "19:00",
            "proposed_ot_start_time": None,
            "proposed_ot_end_time": None,
            "note": None,
        }],
    })
    d = client.get("/api/reviews/disputes", params={"status": "pending"}).json()[0]
    assert client.post(f"/api/reviews/disputes/{d['id']}/reject").status_code == 200
    row = next(
        e for e in client.get("/api/entries", params={"date": "2026-08-15"}).json()
        if e["employee_name"] == "核审甲"
    )
    assert row["start_time"] == "08:00"
```

注意：若测试库跨用例共用姓名「核审甲」且月已锁定，拆到不同 month 或不同姓名；上面 `核审乙` / 不同日期需保证每月只 submit 一次。必要时每个用例用唯一姓名。

- [ ] **Step 2: Run 确认新测失败**

Run: `python -m pytest tests/test_reviews_api.py::test_confirm_updates_one_day_only -v`  
Expected: FAIL

- [ ] **Step 3: 实现 confirm/reject/list**

`confirm_dispute`：
1. 加载 dispute；非 `pending` → `LookupError`
2. 再校验 proposed times
3. 查 `(employee_id, work_date)` 的 `WorkEntry`：
   - 有：`update_entry(db, entry.id, {status, start, end, ot_start, ot_end})`（清加班传 `None`；若 update 不支持显式 null，用现有 `clear` 约定或直接改字段后 flush——以 `entries.update_entry` 实际 API 为准）
   - 无：`create_entry(..., name=emp.name, status="on_duty", ...)`
4. `dispute.status="confirmed"`，`resolved_at=now`，`resolved_entry_id=...`

`reject_dispute`：仅改 `status=rejected`、`resolved_at`。

`list_disputes`：join employee name，可选 `status`/`year`/`month` 过滤。

Schema 增加 `AdminDisputeOut`（含 `employee_name`）与列表响应。

Router：

```python
@router.get("/disputes", response_model=list[AdminDisputeOut])
@router.post("/disputes/{dispute_id}/confirm", response_model=AdminDisputeOut)
@router.post("/disputes/{dispute_id}/reject", response_model=AdminDisputeOut)
```

- [ ] **Step 4: Run 全文件测试**

Run: `python -m pytest tests/test_reviews_api.py -q`  
Expected: PASS

- [ ] **Step 5: Commit（仅用户要求时）**

```bash
git commit -m "接口：异议逐条确认落库与无效。"
```

---

### Task 4: 前端工具 + 员工核审页

**Files:**
- Create: `frontend/src/utils/reviewMonth.js`
- Create: `frontend/src/pages/EmployeeReviewPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- Consumes: `GET /api/reviews/employee-month`, `POST /api/reviews/submit`
- Produces: 页面路由 `/review`

- [ ] **Step 1: `reviewMonth.js`**

```javascript
export function defaultReviewYearMonth(today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  const d = today.getDate()
  if (d === 1) {
    if (m === 1) return { year: y - 1, month: 12 }
    return { year: y, month: m - 1 }
  }
  return { year: y, month: m }
}

export function allowedReviewMonths(today = new Date()) {
  const current = { year: today.getFullYear(), month: today.getMonth() + 1 }
  const def = defaultReviewYearMonth(today)
  const key = (x) => `${x.year}-${x.month}`
  const map = new Map([[key(def), def], [key(current), current]])
  return [...map.values()]
}
```

- [ ] **Step 2: `EmployeeReviewPage.jsx` 骨架行为**

1. 未进入：姓名 input +「查看」按钮 → `GET employee-month`
2. 已进入：年月 select（仅 `allowedReviewMonths`）切换时重新拉取
3. 日列表：展示 status / 主时段 / 加班；未锁定时可「提出异议」展开表单（`TimeField`×4 + textarea 备注）
4. 本地 state：`draftDisputes` Map(`date` → draft)
5. 底部「确认本月核审」：`window.confirm` 文案含「提交后不可再改」→ `POST /api/reviews/submit`，body 只含有草稿的天
6. `reviewed===true`：隐藏提交，只读展示 `disputes` 状态

最小校验（提交前）：主时段两端都有；加班两端都有或都空。

- [ ] **Step 3: 注册路由**

`App.jsx`：

```jsx
import EmployeeReviewPage from './pages/EmployeeReviewPage.jsx'
// ...
<Route path="review" element={<EmployeeReviewPage />} />
```

- [ ] **Step 4: 手动验证**

Run: `npm run dev`（frontend）+ 后端  
Expected: 输入花名册姓名可看到当月天数；填异议后确认；再进显示已核审

- [ ] **Step 5: Commit（仅用户要求时）**

```bash
git commit -m "前端：员工工时核审页。"
```

---

### Task 5: 管理审核页 + 导航

**Files:**
- Create: `frontend/src/pages/AdminDisputesPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/AppShell.jsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- Consumes: `GET /api/reviews/disputes`, `POST .../confirm`, `POST .../reject`

- [ ] **Step 1: `AdminDisputesPage.jsx`**

- 筛选：`pending`（默认）/ `confirmed` / `rejected`
- 每条卡片：姓名、日期、原状态与时段、建议时段与加班、备注
- 仅 `pending` 显示按钮：**确认**、**无效**
- 点击后调用对应 API，成功后从列表刷新或本地更新该条 status
- 确认失败展示 `err.message`

- [ ] **Step 2: 路由 + 导航**

`App.jsx`：`<Route path="review/admin" element={<AdminDisputesPage />} />`

`AppShell.jsx` `navItems`：

```javascript
const navItems = [
  { to: '/', label: '工作日历', end: true },
  { to: '/stats', label: '统计看板', end: false },
  { to: '/review', label: '工时核审', end: false },
  { to: '/review/admin', label: '异议审核', end: false },
]
```

- [ ] **Step 3: 样式**

在 `global.css` 增加 `.review-page`、`.review-day`、`.dispute-card` 等，沿用现有 `--accent` / 表单控件风格，避免新设计体系。

- [ ] **Step 4: 端到端手测清单**

1. 员工提交两天异议 → 管理页两条 pending  
2. 只确认其中一天 → 日历/entries 仅该日变；另一条仍 pending  
3. 无效一条 → 排班不变  
4. 顶栏从日历可进「异议审核」

- [ ] **Step 5: 回归后端测试**

Run: `cd backend; python -m pytest tests/test_reviews_api.py -q`  
Expected: PASS

- [ ] **Step 6: Commit（仅用户要求时）**

```bash
git commit -m "前端：异议审核页与顶栏入口。"
```

---

## Spec coverage (self-review)

| Spec 要求 | Task |
|-----------|------|
| 姓名进入近月核审 | T2, T4 |
| 主时段+加班异议（增/清） | T2, T3, T4 |
| 每天可异议含未安排 | T2/T3 未安排新建 |
| 确认锁定月 | T2 |
| 默认月算法 + 可切当前月 | T4 `reviewMonth.js` |
| 管理逐条确认/无效 | T3, T5 |
| 确认只改当天到岗 | T3 测试 |
| 顶栏跳转 | T5 |
| 无登录 | 全局 |

无 TBD/占位符；类型名与 API 路径在 Tasks 间一致。
