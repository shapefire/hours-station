# 可配置工时计算规则 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将「满 X 小时扣 Y 小时」做成可配置项，设置页可改；用阶梯表存储（第一版仅一档），进程内缓存供全站现算。

**Architecture:** PostgreSQL 表 `hours_rule_tiers` 存档位；启动时载入进程内缓存；`effective_hours` 默认读缓存；`PUT /api/settings/hours-rule` 写库成功后覆盖缓存。前端设置分区编辑两字段，预览通过事件总线刷新规则副本。

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic + pytest；React + Vite；现有 SettingsModal 分区模式。

**Spec:** `docs/superpowers/specs/2026-08-13-configurable-hours-rule-design.md`

## Global Constraints

- 规则：毛工时 ≥ `min_hours` 则扣 `deduct_hours`；`deduct_hours = 0` 表示不扣减
- 约束：`0 < min_hours ≤ 24`；`0 ≤ deduct_hours ≤ min_hours`；最多 1 位小数
- 第一版 API/`tiers` 长度必须为 1；表结构按多档预留
- 匹配：按 `min_hours` 降序，命中第一条
- 默认种子：`min_hours=6.0, deduct_hours=0.5`
- 读路径一律走进程内缓存；写成功后同步更新缓存；单 worker 假设
- 工时不落库，改规则后全局现算
- 提交说明使用中文简述

## File Structure

```
backend/
  alembic/versions/004_hours_rule_tiers.py   # 新建表 + 种子行
  app/models.py                              # HoursRuleTier
  app/schemas.py                             # HoursRuleTierIn/Out, HoursRuleOut/In
  app/services/hours.py                      # 带 tiers 的纯计算（可默认读缓存）
  app/services/hours_rule_cache.py           # 进程内缓存 + load/set/get
  app/services/settings.py                   # get/replace hours rule + 刷新缓存
  app/routers/settings.py                    # GET/PUT hours-rule
  app/main.py                                # lifespan 启动加载缓存
  tests/conftest.py                          # 导入模型、测试前后重置缓存
  tests/test_hours.py                        # 扩展单元测试
  tests/test_hours_rule_api.py               # API + 缓存行为
frontend/
  src/utils/hours.js                         # 按 tiers 预览
  src/settings/events.js                     # hours-rule 事件
  src/settings/hoursRule.js                  # 前端规则缓存 load/get/subscribe
  src/components/HoursBreakdown.jsx          # 使用规则缓存
  src/components/SettingsModal.jsx           # 「工时计算」分区
  src/styles/global.css                      # 分区表单样式（如需）
```

---

### Task 1: 模型 + 迁移（含默认种子）

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/004_hours_rule_tiers.py`
- Modify: `backend/tests/conftest.py`（导入 `HoursRuleTier`）

**Interfaces:**
- Produces: 模型 `HoursRuleTier`；表 `hours_rule_tiers`；种子一行 `(6.0, 0.5)`

- [ ] **Step 1: 在 `models.py` 增加模型**

在 `NotePreset` 旁添加：

```python
from decimal import Decimal
from sqlalchemy import Numeric

class HoursRuleTier(Base):
    __tablename__ = "hours_rule_tiers"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    min_hours: Mapped[Decimal] = mapped_column(Numeric(4, 1), unique=True, nullable=False)
    deduct_hours: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

（按文件现有 import 风格合并 `Numeric` / `Decimal`。）

- [ ] **Step 2: 写 Alembic 迁移 `004_hours_rule_tiers`**

```python
"""hours rule tiers

Revision ID: 004_hours_rule_tiers
Revises: 003_note_presets
Create Date: 2026-08-13
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa

revision: str = "004_hours_rule_tiers"
down_revision: Union[str, Sequence[str], None] = "003_note_presets"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        "hours_rule_tiers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("min_hours", sa.Numeric(4, 1), nullable=False),
        sa.Column("deduct_hours", sa.Numeric(4, 1), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("min_hours"),
    )
    op.execute(
        sa.text(
            "INSERT INTO hours_rule_tiers (id, min_hours, deduct_hours, sort_order) "
            "VALUES (:id, 6.0, 0.5, 0)"
        ).bindparams(id=uuid.uuid4())
    )

def downgrade() -> None:
    op.drop_table("hours_rule_tiers")
```

若项目用 `op.bulk_insert` 更惯用，可改用 bulk_insert，语义相同。

- [ ] **Step 3: 更新 `conftest.py` 导入**

```python
from app.models import Employee, NotePreset, WorkEntry, HoursRuleTier  # noqa: F401
```

`create_all` 会建表，但**不会**跑 Alembic 种子；后续 Task 的 cache load / API 测试自行插入默认行或调用 `ensure_default_tiers`。

- [ ] **Step 4: 本地跑迁移（开发库）**

Run: `cd backend && alembic upgrade head`  
Expected: 成功；表存在且有一行 `6.0 / 0.5`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/alembic/versions/004_hours_rule_tiers.py backend/tests/conftest.py
git commit -m "新增工时规则阶梯表与默认种子迁移"
```

---

### Task 2: 纯函数工时计算支持 tiers（TDD）

**Files:**
- Modify: `backend/app/services/hours.py`
- Modify: `backend/tests/test_hours.py`

**Interfaces:**
- Produces:
  - `DEFAULT_TIERS: list[tuple[Decimal, Decimal]] = [(Decimal("6.0"), Decimal("0.5"))]`
  - `effective_hours(start: time, end: time, tiers: Sequence[tuple[Decimal, Decimal]] | None = None) -> Decimal`
  - `tiers is None` 时调用 `get_cached_tiers()`（Task 3 提供）；**本 Task 先允许 `tiers` 必传或 `None` 时用 `DEFAULT_TIERS`**，避免循环依赖——推荐本 Task：`None` → `DEFAULT_TIERS`；Task 3/4 再改为读缓存的包装或改默认。

为保持单测纯净，本 Task 约定：

```python
def effective_hours(start, end, tiers=None) -> Decimal:
    resolved = list(tiers) if tiers is not None else list(DEFAULT_TIERS)
    ...
```

Task 4 将调用点改为显式传入 `get_cached_tiers()`，或把默认改为读缓存。计划采用：**默认 `tiers=None` 时读缓存**；单测始终显式传 `tiers`。Task 2 实现时若 cache 模块尚未就绪，在 `hours.py` 顶部：

```python
def _resolve_tiers(tiers):
    if tiers is not None:
        return list(tiers)
    try:
        from app.services.hours_rule_cache import get_cached_tiers
        return list(get_cached_tiers())
    except Exception:
        return list(DEFAULT_TIERS)
```

更干净的做法（推荐执行时采用）：Task 2 只接受显式 `tiers`（默认 `DEFAULT_TIERS`）；Task 3 完成后，新增 `effective_hours_from_cache(start, end)` 或让调用方传 `get_cached_tiers()`。为减少调用点改动，**最终形态**：

```python
def effective_hours(start: time, end: time, tiers: Sequence[tuple[Decimal, Decimal]] | None = None) -> Decimal:
    if tiers is None:
        from app.services.hours_rule_cache import get_cached_tiers
        tiers = get_cached_tiers()
    if not tiers:
        tiers = DEFAULT_TIERS
    # match descending by min_hours
```

Task 2 写测试时全部显式传 `tiers`，不依赖缓存。

- [ ] **Step 1: 重写失败测试 `test_hours.py`**

```python
from datetime import time
from decimal import Decimal
import pytest
from app.services.hours import effective_hours, DEFAULT_TIERS

def test_default_under_six_no_deduction():
    assert effective_hours(time(9, 0), time(14, 30), DEFAULT_TIERS) == Decimal("5.5")

def test_default_exactly_six_deducts_half():
    assert effective_hours(time(9, 0), time(15, 0), DEFAULT_TIERS) == Decimal("5.5")

def test_default_full_day_example():
    assert effective_hours(time(7, 30), time(16, 0), DEFAULT_TIERS) == Decimal("8.0")

def test_custom_threshold():
    tiers = [(Decimal("8.0"), Decimal("1.0"))]
    assert effective_hours(time(9, 0), time(16, 0), tiers) == Decimal("6.0")  # raw 7 < 8
    assert effective_hours(time(9, 0), time(18, 0), tiers) == Decimal("8.0")  # raw 9 - 1

def test_deduct_zero_means_no_deduction():
    tiers = [(Decimal("6.0"), Decimal("0"))]
    assert effective_hours(time(7, 30), time(16, 0), tiers) == Decimal("8.5")

def test_tier_match_highest_min_first():
    tiers = [
        (Decimal("6.0"), Decimal("0.5")),
        (Decimal("10.0"), Decimal("1.0")),
    ]
    # raw 10.0 -> match 10.0 tier
    assert effective_hours(time(8, 0), time(18, 0), tiers) == Decimal("9.0")

def test_boundary_min_hours_24():
    tiers = [(Decimal("24.0"), Decimal("0.5"))]
    assert effective_hours(time(0, 0), time(23, 0), tiers) == Decimal("23.0")  # no match

def test_end_not_after_start_raises():
    with pytest.raises(ValueError):
        effective_hours(time(16, 0), time(7, 30), DEFAULT_TIERS)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && pytest tests/test_hours.py -v`  
Expected: 新用例 FAIL（旧实现不接受自定义 tiers 行为）

- [ ] **Step 3: 实现 `hours.py`**

```python
from datetime import time, datetime, date
from decimal import Decimal, ROUND_HALF_UP
from typing import Sequence

DEFAULT_TIERS: list[tuple[Decimal, Decimal]] = [(Decimal("6.0"), Decimal("0.5"))]

def effective_hours(
    start: time,
    end: time,
    tiers: Sequence[tuple[Decimal, Decimal]] | None = None,
) -> Decimal:
    if end <= start:
        raise ValueError("结束时间必须晚于开始时间")
    start_dt = datetime.combine(date.min, start)
    end_dt = datetime.combine(date.min, end)
    raw = Decimal(str((end_dt - start_dt).total_seconds() / 3600))

    resolved: list[tuple[Decimal, Decimal]]
    if tiers is None:
        from app.services.hours_rule_cache import get_cached_tiers
        resolved = list(get_cached_tiers())
    else:
        resolved = list(tiers)
    if not resolved:
        resolved = list(DEFAULT_TIERS)

    deduct = Decimal("0")
    for min_hours, deduct_hours in sorted(resolved, key=lambda t: t[0], reverse=True):
        if raw >= min_hours:
            deduct = deduct_hours if deduct_hours > 0 else Decimal("0")
            break

    effective = raw - deduct
    return effective.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
```

若 Task 3 尚未提交，临时在同 PR/同会话先建 stub：

```python
# hours_rule_cache.py stub until Task 3
def get_cached_tiers():
    return list(DEFAULT_TIERS)
```

或本 Task 提交时一并加入最小 stub，Task 3 再充实。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && pytest tests/test_hours.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/hours.py backend/tests/test_hours.py backend/app/services/hours_rule_cache.py
git commit -m "工时计算支持可配置档位匹配"
```

---

### Task 3: 进程内缓存 + 启动加载

**Files:**
- Create/Modify: `backend/app/services/hours_rule_cache.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`

**Interfaces:**
- Produces:
  - `get_cached_tiers() -> list[tuple[Decimal, Decimal]]`
  - `set_cached_tiers(tiers: Sequence[tuple[Decimal, Decimal]]) -> None`
  - `load_hours_rule_cache(db: Session) -> list[tuple[Decimal, Decimal]]` — 表空则插入默认再读；写缓存并返回
  - `clear_cached_tiers_for_tests() -> None` — 测试用

- [ ] **Step 1: 实现 `hours_rule_cache.py`**

```python
from decimal import Decimal
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import HoursRuleTier
from app.services.hours import DEFAULT_TIERS

_cached_tiers: list[tuple[Decimal, Decimal]] | None = None

def get_cached_tiers() -> list[tuple[Decimal, Decimal]]:
    global _cached_tiers
    if _cached_tiers is None:
        return list(DEFAULT_TIERS)
    return list(_cached_tiers)

def set_cached_tiers(tiers: Sequence[tuple[Decimal, Decimal]]) -> None:
    global _cached_tiers
    _cached_tiers = list(tiers) if tiers else list(DEFAULT_TIERS)

def clear_cached_tiers_for_tests() -> None:
    global _cached_tiers
    _cached_tiers = None

def load_hours_rule_cache(db: Session) -> list[tuple[Decimal, Decimal]]:
    rows = list(
        db.scalars(
            select(HoursRuleTier).order_by(HoursRuleTier.min_hours.desc())
        ).all()
    )
    if not rows:
        db.add(
            HoursRuleTier(
                min_hours=DEFAULT_TIERS[0][0],
                deduct_hours=DEFAULT_TIERS[0][1],
                sort_order=0,
            )
        )
        db.flush()
        rows = list(
            db.scalars(
                select(HoursRuleTier).order_by(HoursRuleTier.min_hours.desc())
            ).all()
        )
    tiers = [(Decimal(str(r.min_hours)), Decimal(str(r.deduct_hours))) for r in rows]
    set_cached_tiers(tiers)
    return tiers
```

- [ ] **Step 2: `main.py` 增加 lifespan**

```python
from contextlib import asynccontextmanager
from app.db import SessionLocal
from app.services.hours_rule_cache import load_hours_rule_cache

@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        load_hours_rule_cache(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    yield

app = FastAPI(title="hours-station", lifespan=lifespan)
```

（保留现有 CORS / router 注册。）

- [ ] **Step 3: `conftest.py` 每个测试重置缓存并加载**

在 `client` fixture 内，创建 `TestClient` 前：

```python
from app.services.hours_rule_cache import clear_cached_tiers_for_tests, load_hours_rule_cache, set_cached_tiers
from app.services.hours import DEFAULT_TIERS

@pytest.fixture()
def client(db):
    clear_cached_tiers_for_tests()
    load_hours_rule_cache(db)  # 测试事务内种子/读取
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    clear_cached_tiers_for_tests()
```

注意：`TestClient` 会触发 lifespan，可能连真实 `SessionLocal`（非测试 DB）。若冲突，改为：

- lifespan 中 load 包在 try/except 并打日志；或
- 测试里 lifespan 加载失败后，`client` fixture 再 `set_cached_tiers(DEFAULT_TIERS)` / `load_hours_rule_cache(db)` 覆盖。

推荐稳健做法：lifespan 使用 `SessionLocal`；`client` fixture 在进入后**强制** `load_hours_rule_cache(db)` 覆盖为测试会话数据。若测试库 `create_all` 无种子，`load_hours_rule_cache` 会插入默认行（在测试事务内，可回滚）。

- [ ] **Step 4: 跑现有测试确认无回归**

Run: `cd backend && pytest tests/test_hours.py tests/test_entries_api.py tests/test_calendar_api.py tests/test_stats_api.py -v`  
Expected: PASS（默认规则行为不变）

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/hours_rule_cache.py backend/app/main.py backend/tests/conftest.py
git commit -m "启动时加载工时规则到进程缓存"
```

---

### Task 4: Settings 服务 + Schema + API

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/settings.py`
- Modify: `backend/app/routers/settings.py`
- Create: `backend/tests/test_hours_rule_api.py`

**Interfaces:**
- Produces:
  - `HoursRuleTierPayload`: `min_hours: str`, `deduct_hours: str`
  - `HoursRuleOut` / `HoursRuleIn`: `{ tiers: list[HoursRuleTierPayload] }`
  - `get_hours_rule() -> HoursRuleOut`（读缓存）
  - `replace_hours_rule(db, tiers) -> HoursRuleOut`（校验、先删后插、`set_cached_tiers`）

- [ ] **Step 1: 写 API 失败测试 `test_hours_rule_api.py`**

```python
from decimal import Decimal
from datetime import time
from app.services.hours import effective_hours
from app.services.hours_rule_cache import get_cached_tiers

def test_get_hours_rule_default(client):
    res = client.get("/api/settings/hours-rule")
    assert res.status_code == 200
    body = res.json()
    assert len(body["tiers"]) == 1
    assert body["tiers"][0]["min_hours"] == "6.0"
    assert body["tiers"][0]["deduct_hours"] == "0.5"

def test_put_hours_rule_and_cache(client):
    res = client.put(
        "/api/settings/hours-rule",
        json={"tiers": [{"min_hours": "8.0", "deduct_hours": "1.0"}]},
    )
    assert res.status_code == 200
    assert res.json()["tiers"][0]["min_hours"] == "8.0"
    got = client.get("/api/settings/hours-rule")
    assert got.json()["tiers"][0]["deduct_hours"] == "1.0"
    # 缓存立即生效
    assert get_cached_tiers()[0][0] == Decimal("8.0")
    assert effective_hours(time(9, 0), time(18, 0)) == Decimal("8.0")  # raw 9 - 1

def test_put_deduct_zero(client):
    res = client.put(
        "/api/settings/hours-rule",
        json={"tiers": [{"min_hours": "6.0", "deduct_hours": "0"}]},
    )
    assert res.status_code == 200
    assert effective_hours(time(7, 30), time(16, 0)) == Decimal("8.5")

def test_put_rejects_min_over_24(client):
    res = client.put(
        "/api/settings/hours-rule",
        json={"tiers": [{"min_hours": "24.5", "deduct_hours": "0.5"}]},
    )
    assert res.status_code == 400

def test_put_rejects_deduct_gt_min(client):
    res = client.put(
        "/api/settings/hours-rule",
        json={"tiers": [{"min_hours": "6.0", "deduct_hours": "6.5"}]},
    )
    assert res.status_code == 400

def test_put_rejects_empty_or_multi_tiers(client):
    assert client.put("/api/settings/hours-rule", json={"tiers": []}).status_code == 400
    assert client.put(
        "/api/settings/hours-rule",
        json={
            "tiers": [
                {"min_hours": "6.0", "deduct_hours": "0.5"},
                {"min_hours": "10.0", "deduct_hours": "1.0"},
            ]
        },
    ).status_code == 400
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && pytest tests/test_hours_rule_api.py -v`  
Expected: FAIL（404 / 路由不存在）

- [ ] **Step 3: Schema**

```python
class HoursRuleTierPayload(BaseModel):
    min_hours: str
    deduct_hours: str

class HoursRuleIn(BaseModel):
    tiers: list[HoursRuleTierPayload]

class HoursRuleOut(BaseModel):
    tiers: list[HoursRuleTierPayload]
```

- [ ] **Step 4: settings service 函数**

```python
def _format_one_decimal(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.1'))}"

def _parse_tier_hours(raw: str, *, field: str) -> Decimal:
    try:
        value = Decimal(str(raw))
    except Exception as exc:
        raise ValueError(f"{field} 格式无效") from exc
    if value != value.quantize(Decimal("0.1")):
        # 允许 "6" / "6.0"；拒绝超过 1 位小数
        quantized = value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        if value != quantized and value.as_tuple().exponent < -1:
            raise ValueError(f"{field} 最多一位小数")
    return value.quantize(Decimal("0.1"))

def validate_tiers_payload(tiers: list) -> list[tuple[Decimal, Decimal]]:
    if len(tiers) != 1:
        raise ValueError("当前仅支持一条工时规则")
    parsed: list[tuple[Decimal, Decimal]] = []
    for item in tiers:
        min_hours = _parse_tier_hours(item.min_hours if hasattr(item, "min_hours") else item["min_hours"], field="满多少小时")
        deduct = _parse_tier_hours(item.deduct_hours if hasattr(item, "deduct_hours") else item["deduct_hours"], field="扣减小时")
        if min_hours <= 0 or min_hours > Decimal("24"):
            raise ValueError("满多少小时须在 0 到 24 之间（不含 0）")
        if deduct < 0 or deduct > min_hours:
            raise ValueError("扣减小时须在 0 到满额小时之间")
        parsed.append((min_hours, deduct))
    return parsed

def get_hours_rule() -> dict:
    tiers = get_cached_tiers()
    return {
        "tiers": [
            {"min_hours": _format_one_decimal(m), "deduct_hours": _format_one_decimal(d)}
            for m, d in tiers
        ]
    }

def replace_hours_rule(db: Session, tiers_in: list) -> dict:
    parsed = validate_tiers_payload(tiers_in)
    db.query(HoursRuleTier).delete()  # 或 delete(select...) SQLAlchemy 2.0 风格
    # 推荐：
    # from sqlalchemy import delete
    # db.execute(delete(HoursRuleTier))
    for index, (min_hours, deduct) in enumerate(parsed):
        db.add(HoursRuleTier(min_hours=min_hours, deduct_hours=deduct, sort_order=index))
    db.flush()
    set_cached_tiers(parsed)
    return get_hours_rule()
```

（执行时用项目既有 SQLAlchemy 2 删除写法，避免 `db.query` 若已弃用。）

- [ ] **Step 5: Router**

```python
@router.get("/hours-rule", response_model=HoursRuleOut)
def read_hours_rule():
    return HoursRuleOut.model_validate(settings_service.get_hours_rule())

@router.put("/hours-rule", response_model=HoursRuleOut)
def update_hours_rule(payload: HoursRuleIn, db: Session = Depends(get_db)):
    try:
        data = settings_service.replace_hours_rule(db, payload.tiers)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=_exc_detail(exc)) from exc
    return HoursRuleOut.model_validate(data)
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd backend && pytest tests/test_hours_rule_api.py tests/test_hours.py tests/test_entries_api.py -v`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/services/settings.py backend/app/routers/settings.py backend/tests/test_hours_rule_api.py
git commit -m "新增工时规则设置 API 并同步刷新缓存"
```

---

### Task 5: 前端规则缓存 + 预览算法

**Files:**
- Modify: `frontend/src/utils/hours.js`
- Modify: `frontend/src/settings/events.js`
- Create: `frontend/src/settings/hoursRule.js`
- Modify: `frontend/src/components/HoursBreakdown.jsx`

**Interfaces:**
- Produces:
  - `computeHoursBreakdown(start, end, tiers)` — `tiers: [{ min_hours, deduct_hours }]`
  - `loadHoursRule()` / `getHoursRule()` / `subscribeHoursRule(listener)` / `notifyHoursRuleChanged()`

- [ ] **Step 1: 扩展 `events.js`**

```javascript
const hoursRuleListeners = new Set()

export function subscribeHoursRule(listener) {
  hoursRuleListeners.add(listener)
  return () => hoursRuleListeners.delete(listener)
}

export function notifyHoursRuleChanged() {
  hoursRuleListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      /* ignore */
    }
  })
}
```

（保留原有 note-presets 函数。）

- [ ] **Step 2: 新建 `hoursRule.js`**

```javascript
import api from '../api/client.js'
import { notifyHoursRuleChanged, subscribeHoursRule } from './events.js'

const DEFAULT_RULE = { tiers: [{ min_hours: '6.0', deduct_hours: '0.5' }] }
let cached = null
let loading = null

export function getHoursRule() {
  return cached || DEFAULT_RULE
}

export function subscribeHoursRuleState(listener) {
  return subscribeHoursRule(listener)
}

export async function loadHoursRule({ force = false } = {}) {
  if (!force && cached) return cached
  if (!force && loading) return loading
  loading = api
    .get('/api/settings/hours-rule')
    .then((body) => {
      cached = body && Array.isArray(body.tiers) ? body : DEFAULT_RULE
      notifyHoursRuleChanged()
      return cached
    })
    .catch(() => {
      if (!cached) cached = DEFAULT_RULE
      return cached
    })
    .finally(() => {
      loading = null
    })
  return loading
}

export function setHoursRuleLocal(body) {
  cached = body && Array.isArray(body.tiers) ? body : DEFAULT_RULE
  notifyHoursRuleChanged()
}
```

- [ ] **Step 3: 更新 `hours.js`**

```javascript
export function computeHoursBreakdown(startTime, endTime, tiers) {
  const start = parseHm(startTime)
  const end = parseHm(endTime)
  if (!start || !end) {
    return { ok: false, reason: '时段无效', raw: null, deduct: null, effective: null }
  }
  const rawMinutes = end.totalMinutes - start.totalMinutes
  if (rawMinutes <= 0) {
    return { ok: false, reason: '结束须晚于开始', raw: null, deduct: null, effective: null }
  }

  const raw = round1(rawMinutes / 60)
  const list = Array.isArray(tiers) && tiers.length ? tiers : [{ min_hours: '6.0', deduct_hours: '0.5' }]
  const sorted = [...list].sort((a, b) => Number(b.min_hours) - Number(a.min_hours))
  let deduct = 0
  for (const tier of sorted) {
    const minH = Number(tier.min_hours)
    const ded = Number(tier.deduct_hours)
    if (raw >= minH) {
      deduct = ded > 0 ? ded : 0
      break
    }
  }
  const effective = round1(raw - deduct)
  return { ok: true, reason: null, raw, deduct, effective }
}
```

- [ ] **Step 4: 更新 `HoursBreakdown.jsx`**

```javascript
import { useEffect, useState } from 'react'
import { computeHoursBreakdown, formatHoursNumber } from '../utils/hours.js'
import { getHoursRule, loadHoursRule, subscribeHoursRuleState } from '../settings/hoursRule.js'
import Metric from './Metric.jsx'

export default function HoursBreakdown({ startTime, endTime }) {
  const [rule, setRule] = useState(() => getHoursRule())

  useEffect(() => {
    loadHoursRule()
    return subscribeHoursRuleState(() => setRule(getHoursRule()))
  }, [])

  const result = computeHoursBreakdown(startTime, endTime, rule.tiers)
  // ... 其余 JSX 不变
}
```

- [ ] **Step 5: 手动抽查**（无前端单测时）

打开录入表单，默认 7:30–16:00 应仍显示扣 0.5 / 实际 8.0。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/hours.js frontend/src/settings/events.js frontend/src/settings/hoursRule.js frontend/src/components/HoursBreakdown.jsx
git commit -m "前端工时预览改为读取可配置规则"
```

---

### Task 6: 设置页「工时计算」分区

**Files:**
- Modify: `frontend/src/components/SettingsModal.jsx`
- Modify: `frontend/src/styles/global.css`（如需表单行样式）

**Interfaces:**
- Consumes: `GET/PUT /api/settings/hours-rule`；`setHoursRuleLocal` + `notifyHoursRuleChanged`

- [ ] **Step 1: 扩展 SECTIONS 与状态**

```javascript
import { setHoursRuleLocal } from '../settings/hoursRule.js'
import { notifyHoursRuleChanged } from '../settings/events.js'

const SECTIONS = [
  { id: 'note-presets', label: '备注预设' },
  { id: 'hours-rule', label: '工时计算' },
]
```

增加状态：`minHours`, `deductHours`, `hoursLoading`, `hoursBusy`, `hoursError`, `hoursSaved`。

- [ ] **Step 2: 打开 / 切换到该分区时加载**

```javascript
function loadHoursRuleForm() {
  setHoursLoading(true)
  setHoursError(null)
  return api
    .get('/api/settings/hours-rule')
    .then((body) => {
      const tier = body?.tiers?.[0] || { min_hours: '6.0', deduct_hours: '0.5' }
      setMinHours(String(tier.min_hours))
      setDeductHours(String(tier.deduct_hours))
      setHoursRuleLocal(body)
    })
    .catch(() => setHoursError('加载失败，请稍后重试'))
    .finally(() => setHoursLoading(false))
}
```

- [ ] **Step 3: 保存处理**

```javascript
async function handleSaveHoursRule(event) {
  event.preventDefault()
  if (hoursBusy) return
  setHoursBusy(true)
  setHoursError(null)
  setHoursSaved(false)
  try {
    const body = await api.put('/api/settings/hours-rule', {
      tiers: [{ min_hours: minHours.trim(), deduct_hours: deductHours.trim() }],
    })
    setHoursRuleLocal(body)
    notifyHoursRuleChanged()
    const tier = body.tiers[0]
    setMinHours(String(tier.min_hours))
    setDeductHours(String(tier.deduct_hours))
    setHoursSaved(true)
  } catch (err) {
    const detail = err?.detail || err?.message
    setHoursError(typeof detail === 'string' ? detail : '保存失败，请稍后重试')
  } finally {
    setHoursBusy(false)
  }
}
```

（按现有 `api/client.js` 错误形状取 `detail`。）

- [ ] **Step 4: 分区 JSX**

```jsx
{section === 'hours-rule' ? (
  <section className="settings-modal__section" aria-label="工时计算">
    <h3 className="settings-modal__section-title">工时计算</h3>
    <p className="settings-modal__hint">
      毛工时达到或超过该阈值时扣减；扣减为 0 表示不扣。
    </p>
    {hoursLoading ? <p className="settings-modal__status">加载中…</p> : null}
    {hoursError ? <p className="settings-modal__error">{hoursError}</p> : null}
    {hoursSaved ? <p className="settings-modal__status">已保存</p> : null}
    <form className="settings-modal__hours-form" onSubmit={handleSaveHoursRule}>
      <label className="settings-modal__field">
        <span>满多少小时</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0.1"
          max="24"
          value={minHours}
          disabled={hoursBusy || hoursLoading}
          onChange={(e) => {
            setHoursSaved(false)
            setMinHours(e.target.value)
          }}
          required
        />
      </label>
      <label className="settings-modal__field">
        <span>扣减小时</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          value={deductHours}
          disabled={hoursBusy || hoursLoading}
          onChange={(e) => {
            setHoursSaved(false)
            setDeductHours(e.target.value)
          }}
          required
        />
      </label>
      <button type="submit" className="btn btn--primary btn--sm" disabled={hoursBusy || hoursLoading}>
        保存
      </button>
    </form>
  </section>
) : null}
```

- [ ] **Step 5: 补少量 CSS**（与现有 settings 表单风格一致：字段纵向间距、hint 次要色）

- [ ] **Step 6: 手动验收**

1. 打开设置 → 工时计算，见 6 / 0.5  
2. 改为 8 / 1，保存  
3. 录入 9:00–18:00，预览应为扣 1 / 实际 8  
4. 改为 6 / 0，预览不扣减  
5. 输入 25 保存，应看到错误  

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SettingsModal.jsx frontend/src/styles/global.css
git commit -m "设置页增加工时计算规则配置"
```

---

### Task 7: 全量回归

**Files:**
- 无新文件（必要时微调测试夹具）

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && pytest -v`  
Expected: 全部 PASS

- [ ] **Step 2: 前端构建**

Run: `cd frontend && npm run build`  
Expected: 构建成功

- [ ] **Step 3: 若有失败则修复并追加 commit**（中文说明）

- [ ] **Step 4: 最终确认 commit 历史清晰**

```bash
git log --oneline -8
```

---

## Spec Coverage Checklist

| Spec 项 | Task |
|---------|------|
| `hours_rule_tiers` 表 + 种子 6/0.5 | Task 1 |
| `min_hours ≤ 24`，`deduct=0` 不扣 | Task 2, 4, 6 |
| 降序匹配档位 | Task 2 |
| GET/PUT `/api/settings/hours-rule`，tiers 长度 1 | Task 4 |
| 启动加载缓存；读缓存；写后更新 | Task 3, 4 |
| 调用点现算用新规则 | Task 2（默认读缓存）+ 现有 services 不改签名即可 |
| 设置页 UI | Task 6 |
| 前端预览同步 | Task 5, 6 |
| 测试：单元 / API / 回归 / 缓存 | Task 2, 4, 7 |

## Self-Review Notes

- 无 TBD；类型名 `HoursRuleTier` / `get_cached_tiers` / `replace_hours_rule` 前后一致
- 第一版不实现多档 UI / 模板 / 多 worker 广播
- `effective_hours(..., tiers=None)` 读缓存，现有 calendar/stats/entries **无需逐处改签名**（依赖 Task 3 缓存已加载）
