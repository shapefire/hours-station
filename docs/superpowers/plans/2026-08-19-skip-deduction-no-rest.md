# 到岗「未休息」跳过扣减 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 到岗可勾选「未休息」，主时段与加班段均按毛时长计工时（不套满点扣减），备注自动带上「未休息不扣减」。

**Architecture:** `work_entries.skip_deduction` 布尔字段；`effective_hours(..., skip_deduction=False)` 为 true 时扣减为 0；服务层写入时规范化备注短语；前端 EntryForm 勾选即时改备注并刷新工时明细。复制走同一字段。导入本期不设该标记。

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest；React（无前端单测目录，前端以 `npm run build` + 手测）

**Spec:** `docs/superpowers/specs/2026-08-19-skip-deduction-no-rest-design.md`

## Global Constraints

- 固定短语恰好为 `未休息不扣减`，顿号 `、` 拼接
- 仅 `on_duty` 可为 `skip_deduction=true`；休息/请假/支援强制 `false`
- 主时段和加班段一并跳过扣减
- 工时仍系统计算；不改设置里的扣减档
- 文本导入不自动识别该标记（commit 保持 false）
- 列表不另做徽章
- Commit 步骤仅在用户要求提交时执行

---

## File Structure

| 文件 | 职责 |
|------|------|
| `backend/app/services/hours.py` | `effective_hours(..., skip_deduction=False)` |
| `backend/tests/test_hours.py` | 跳过扣减的纯函数测试 |
| `backend/app/services/notes.py` 或 `entries.py` 内 | `apply_skip_deduction_note(note, skip) -> str \| None` |
| `backend/tests/test_skip_deduction_note.py` | 备注拼接/移除 |
| `backend/alembic/versions/007_skip_deduction.py` | 加列 |
| `backend/app/models.py` | `skip_deduction` |
| `backend/app/schemas.py` | Create/Update/Out |
| `backend/app/services/entries.py` | 规范化、计时、复制传字段 |
| `backend/app/routers/entries.py` | 传入 `skip_deduction` |
| `backend/tests/test_entries_api.py` / `test_copy_api.py` | API 验收 |
| `frontend/src/utils/hours.js` | `computeHoursBreakdown(..., { skipDeduction })` |
| `frontend/src/components/HoursBreakdown.jsx` | `skipDeduction` prop |
| `frontend/src/components/EntryForm.jsx` | 勾选 + 备注 |
| `frontend/src/components/DayPanel.jsx` | 快速复制带标记 |
| `frontend/src/pages/CalendarPage.jsx` | POST/PATCH 传字段 |

常量（前后端一致）：

```python
SKIP_DEDUCTION_NOTE = "未休息不扣减"
```

```js
export const SKIP_DEDUCTION_NOTE = '未休息不扣减'
```

---

### Task 1: `effective_hours` 支持 skip_deduction

**Files:**
- Modify: `backend/app/services/hours.py`
- Test: `backend/tests/test_hours.py`

**Interfaces:**
- Produces: `effective_hours(start, end, tiers=None, skip_deduction: bool = False) -> Decimal`
- 当 `skip_deduction=True`：`deduct = 0`，返回 `round1(raw)`；仍校验 `end > start`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_hours.py` 追加：

```python
def test_skip_deduction_ignores_default_tier():
    # raw 8.5, default 满6减0.5 → 正常 8.0；skip → 8.5
    assert effective_hours(time(7, 30), time(16, 0), DEFAULT_TIERS, skip_deduction=True) == Decimal("8.5")

def test_skip_deduction_ignores_custom_one_hour():
    tiers = [(Decimal("7.0"), Decimal("1.0"))]
    assert effective_hours(time(9, 0), time(16, 30), tiers, skip_deduction=False) == Decimal("6.5")  # 7.5-1
    assert effective_hours(time(9, 0), time(16, 30), tiers, skip_deduction=True) == Decimal("7.5")

def test_skip_deduction_false_unchanged():
    assert effective_hours(time(7, 30), time(16, 0), DEFAULT_TIERS, skip_deduction=False) == Decimal("8.0")
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_hours.py::test_skip_deduction_ignores_default_tier -v`  
Expected: FAIL（`skip_deduction` unexpected kwarg 或结果仍为 8.0）

- [ ] **Step 3: 实现**

```python
def effective_hours(
    start: time,
    end: time,
    tiers: Sequence[tuple[Decimal, Decimal]] | None = None,
    skip_deduction: bool = False,
) -> Decimal:
    # ... 现有 raw 计算与 end>start 校验不变 ...
    deduct = Decimal("0")
    if not skip_deduction:
        for min_hours, deduct_hours in sorted(resolved, key=lambda t: t[0], reverse=True):
            if raw >= min_hours:
                deduct = deduct_hours if deduct_hours > 0 else Decimal("0")
                break
    effective = raw - deduct
    return effective.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
```

- [ ] **Step 4: 跑 `python -m pytest tests/test_hours.py -v`** Expected: PASS

- [ ] **Step 5: Commit**（若用户要求）

```bash
git add backend/app/services/hours.py backend/tests/test_hours.py
git commit -m "工时计算支持跳过满点扣减，供未休息到岗使用。"
```

---

### Task 2: 备注短语规范化

**Files:**
- Create: `backend/app/services/skip_deduction_note.py`
- Test: `backend/tests/test_skip_deduction_note.py`

**Interfaces:**
- Produces:

```python
SKIP_DEDUCTION_NOTE = "未休息不扣减"

def apply_skip_deduction_note(note: str | None, skip: bool) -> str | None:
    ...
```

按 `、` 拆分、trim、去掉空段；先移除已有短语；若 `skip` 则 append；空则 `None`。

- [ ] **Step 1: 写失败测试**

```python
from app.services.skip_deduction_note import apply_skip_deduction_note

def test_append_on_empty():
    assert apply_skip_deduction_note(None, True) == "未休息不扣减"
    assert apply_skip_deduction_note("", True) == "未休息不扣减"

def test_append_with_existing():
    assert apply_skip_deduction_note("制备位", True) == "制备位、未休息不扣减"

def test_no_duplicate():
    assert apply_skip_deduction_note("制备位、未休息不扣减", True) == "制备位、未休息不扣减"

def test_remove_phrase():
    assert apply_skip_deduction_note("制备位、未休息不扣减", False) == "制备位"
    assert apply_skip_deduction_note("未休息不扣减", False) is None
```

- [ ] **Step 2: pytest 该文件** Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```python
SKIP_DEDUCTION_NOTE = "未休息不扣减"

def apply_skip_deduction_note(note: str | None, skip: bool) -> str | None:
    parts = [p.strip() for p in str(note or "").split("、") if p.strip()]
    parts = [p for p in parts if p != SKIP_DEDUCTION_NOTE]
    if skip:
        parts.append(SKIP_DEDUCTION_NOTE)
    if not parts:
        return None
    return "、".join(parts)
```

- [ ] **Step 4: pytest PASS**

- [ ] **Step 5: Commit**（若要求）

```bash
git add backend/app/services/skip_deduction_note.py backend/tests/test_skip_deduction_note.py
git commit -m "规范化未休息备注短语的拼接与移除。"
```

---

### Task 3: 迁移 + 模型 + schema

**Files:**
- Create: `backend/alembic/versions/007_skip_deduction.py`
- Modify: `backend/app/models.py`（`WorkEntry`）
- Modify: `backend/app/schemas.py`（`EntryCreate` / `EntryUpdate` / `EntryOut`）

**Interfaces:**
- Produces: 列 `skip_deduction BOOLEAN NOT NULL DEFAULT false`；Pydantic 字段默认 `False` / Update 可选

- [ ] **Step 1: 迁移**（`down_revision = "006_ot_and_day_notes"`）

```python
def upgrade() -> None:
    op.add_column(
        "work_entries",
        sa.Column("skip_deduction", sa.Boolean(), nullable=False, server_default="false"),
    )

def downgrade() -> None:
    op.drop_column("work_entries", "skip_deduction")
```

- [ ] **Step 2: 模型**

```python
skip_deduction: Mapped[bool] = mapped_column(
    Boolean, nullable=False, default=False, server_default="false"
)
```

放在 `is_trial` 之后。

- [ ] **Step 3: schema**  
`EntryCreate.skip_deduction: bool = False`  
`EntryUpdate.skip_deduction: bool | None = None`  
`EntryOut.skip_deduction: bool`

- [ ] **Step 4: `cd backend && python -m alembic upgrade head`**（本地库）Expected: 成功。无库则至少保证文件可 import。

- [ ] **Step 5: Commit**（若要求）

```bash
git add backend/alembic/versions/007_skip_deduction.py backend/app/models.py backend/app/schemas.py
git commit -m "为到岗记录增加 skip_deduction 字段。"
```

---

### Task 4: entries 服务与 API

**Files:**
- Modify: `backend/app/services/entries.py`
- Modify: `backend/app/routers/entries.py`
- Test: `backend/tests/test_entries_api.py`、`backend/tests/test_copy_api.py`、`backend/tests/test_entries_ot.py`（可选一条双段）

**Interfaces:**
- `entry_hours_decimal(entry)` 两段都传 `skip_deduction=bool(entry.skip_deduction)`
- `_normalize_entry_fields` 增加 `skip_deduction`，非 on_duty 返回 `False`
- `create_entry` / `update_entry` / `copy_day` / `copy_person` 读写该字段；写入前 `note = apply_skip_deduction_note(note, skip)`
- `entry_to_dict` 含 `skip_deduction`
- 导入不改解析；`commit` 创建条目时不传则默认 false

- [ ] **Step 1: API 测试（红）**

`test_entries_api.py`：

```python
def test_on_duty_skip_deduction_no_half_hour(client):
    # 默认档满6减0.5；7:30-16:00 raw 8.5
    r = client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "未休甲",
        "start_time": "07:30",
        "end_time": "16:00",
        "skip_deduction": True,
    })
    assert r.status_code == 201
    body = r.json()
    assert body["skip_deduction"] is True
    assert body["effective_hours"] == "8.5"
    assert "未休息不扣减" in (body["note"] or "")

def test_on_duty_without_skip_still_deducts(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "正常乙",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    assert r.json()["effective_hours"] == "8.0"
    assert r.json()["skip_deduction"] is False

def test_rest_rejects_keeping_skip(client):
    created = client.post("/api/entries", json={
        "work_date": "2026-08-02",
        "name": "转休息",
        "start_time": "07:30",
        "end_time": "16:00",
        "skip_deduction": True,
    }).json()
    r = client.patch(f"/api/entries/{created['id']}", json={"status": "rest", "clear_times": True})
    assert r.status_code == 200
    assert r.json()["skip_deduction"] is False
```

`test_copy_api.py`：复制后目标 `skip_deduction` 与源相同。

双段（可放 `test_entries_ot.py`）：主段 7:30-16:00 + 加班 16:00-23:00，默认两段都扣；`skip_deduction=True` 时两段都不扣（用当前默认档算出期望字符串后写死断言）。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 接线**

`entry_hours_decimal`：

```python
skip = bool(getattr(entry, "skip_deduction", False))
if entry.start_time is not None and entry.end_time is not None:
    total += effective_hours(entry.start_time, entry.end_time, skip_deduction=skip)
if entry.ot_start_time is not None and entry.ot_end_time is not None:
    total += effective_hours(entry.ot_start_time, entry.ot_end_time, skip_deduction=skip)
```

`_normalize_entry_fields` 增加参数 `skip_deduction: bool`，rest/leave/support 返回 False；on_duty 返回 `bool(skip_deduction)`。

create/update：规范化 note；copy_day / copy_person 复制 `skip_deduction`。

router create/patch 传入 `payload.skip_deduction`（patch 为 None 则保持原值）。

- [ ] **Step 4:** `cd backend && python -m pytest tests/test_hours.py tests/test_skip_deduction_note.py tests/test_entries_api.py tests/test_copy_api.py tests/test_entries_ot.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**（若要求）

```bash
git add backend/app/services/entries.py backend/app/routers/entries.py backend/tests
git commit -m "到岗未休息标记写入后按毛时长计工时，复制保留该标记。"
```

---

### Task 5: 前端表单与提交

**Files:**
- Modify: `frontend/src/utils/hours.js`
- Modify: `frontend/src/components/HoursBreakdown.jsx`
- Modify: `frontend/src/components/EntryForm.jsx`
- Modify: `frontend/src/components/DayPanel.jsx`（`DraftCopyRow`）
- Modify: `frontend/src/pages/CalendarPage.jsx`

**Interfaces:**
- `computeHoursBreakdown(startTime, endTime, tiers, skipDeduction = false)`；true 时 `deduct = 0`
- `HoursBreakdown({ skipDeduction = false })`
- `applySkipDeductionNote(note, skip)` 与后端同语义（可放 `frontend/src/utils/skipDeductionNote.js`）
- EntryForm 勾选变化：`setForm` 同时改 `skip_deduction` 与 `note`
- payload / CalendarPage create·edit·draft POST 含 `skip_deduction`

- [ ] **Step 1: hours.js**

```javascript
export function computeHoursBreakdown(startTime, endTime, tiers, skipDeduction = false) {
  // ... raw 计算不变 ...
  let deduct = 0
  if (!skipDeduction) {
    // 现有档循环
  }
  const effective = round1(raw - deduct)
  return { ok: true, reason: null, raw, deduct, effective }
}
```

- [ ] **Step 2: HoursBreakdown** 增加 `skipDeduction`，传给 `computeHoursBreakdown`。EntryForm 主段与加班段的 Breakdown 都传入 `form.skip_deduction`。

- [ ] **Step 3: 备注工具 + EntryForm**

```javascript
export const SKIP_DEDUCTION_NOTE = '未休息不扣减'

export function applySkipDeductionNote(note, skip) {
  const parts = String(note || '')
    .split('、')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => p !== SKIP_DEDUCTION_NOTE)
  if (skip) parts.push(SKIP_DEDUCTION_NOTE)
  return parts.join('、')
}
```

EMPTY / `entryToForm` 增加 `skip_deduction: !!entry.skip_deduction`。  
外援、试工后：

```jsx
<label>
  <input
    type="checkbox"
    checked={form.skip_deduction}
    onChange={(e) => {
      const skip = e.target.checked
      setForm((prev) => ({
        ...prev,
        skip_deduction: skip,
        note: applySkipDeductionNote(prev.note, skip),
      }))
    }}
    disabled={busy}
  />
  未休息
</label>
```

submit：`skip_deduction: !!form.skip_deduction`，`note` 再跑一遍 `applySkipDeductionNote`。

- [ ] **Step 4: DraftCopyRow** 状态带上 `skip_deduction`，提交传入；源条目勾选则备注已含短语。

- [ ] **Step 5: CalendarPage** create / edit / draft `skip_deduction: !!payload.skip_deduction`。

- [ ] **Step 6:** `cd frontend && npm run build` Expected: exit 0

- [ ] **Step 7: 手测清单**

| 项 | 期望 |
|----|------|
| 勾选未休息 | 明细扣减 0；保存后工时为毛时长；备注含短语 |
| 取消勾选 | 恢复扣减；短语消失 |
| 已有备注再勾选 | `制备位、未休息不扣减` |
| 带加班且两段都超阈值 | 两段都不扣 |
| 复制单人 | 目标仍不扣且备注保留 |
| 改休息 | 无未休息勾选；标记 false |

- [ ] **Step 8: Commit**（若要求）

```bash
git add frontend/src
git commit -m "到岗表单增加未休息勾选，预览工时不扣减并自动拼接备注。"
```

---

## Spec coverage（自检）

| 规格 | 任务 |
|------|------|
| §5 字段与约束 | T3–T4 |
| §6 两段都不扣 | T1、T4、T5 |
| §7 备注短语 | T2、T4、T5 |
| §8 API / 导入不识别 | T4（默认 false） |
| §9 EntryForm / 复制 | T5 |
| §10 验收 | T4 测试 + T5 手测 |

无 TBD。字段名全程 `skip_deduction` / 前端 payload 同名。
