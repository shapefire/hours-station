# 支援时段非必填 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增、编辑、文本导入中支援主时段改为非必填；成对约束保留；无时段时支援天数仍计、工时为 0。

**Architecture:** 放宽 `entries._normalize_entry_fields` 对 support 的时段校验；导入去掉 `missing_support_times`，缺一边用 `incomplete_time_pair`；前端 `SupportForm` 与导入预览同步。统计无需改（`entry_hours_decimal` 无时段已为 0）。

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, Vite

## Global Constraints

- 支援：开始/结束都空 → 允许；只填一边 → 拒绝「时段须成对填写」
- 无时段：支援天数计 1，支援工时 `0.0`
- 到岗仍强制时段；休息/请假仍禁止主时段；加班成对规则不变
- 不改 Excel 导出口径
- Spec：`docs/superpowers/specs/2026-08-25-support-times-optional-design.md`
- 提交信息用中文总结；仅在用户要求时 commit（本 plan 步骤里的 commit 由执行者按用户指示处理，默认可跳过 commit 步或在整批结束后统一提交）

## File Map

| 文件 | 职责 |
|------|------|
| `backend/app/services/entries.py` | support 时段成对可选 |
| `backend/app/services/roster_text_import.py` | 去掉 missing_support；缺一边 incomplete_time_pair |
| `backend/tests/test_entries_api.py` | create/patch 支援无时段与半边 |
| `backend/tests/test_roster_text_parse.py` | 解析错误码更新 |
| `backend/tests/test_roster_text_import_api.py` | preview/commit 更新 |
| `frontend/src/components/SupportForm.jsx` | 时段非必填、默认空、成对校验 |
| `frontend/src/components/RosterTextImportModal.jsx` | 错误文案与 recomputeEntryErrors |

---

### Task 1: Backend entries — 支援时段成对可选

**Files:**
- Modify: `backend/app/services/entries.py`
- Test: `backend/tests/test_entries_api.py`

**Interfaces:**
- Produces: `_normalize_entry_fields` 对 `status=="support"`：双空 OK；单边 `ValueError("时段须成对填写")`；双填走 `format_effective_hours`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_entries_api.py` 追加：

```python
def test_create_support_without_times_allowed(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-20",
        "name": "支援甲",
        "status": "support",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "support"
    assert body["start_time"] is None
    assert body["end_time"] is None
    assert body["effective_hours"] == "0.0"


def test_create_support_incomplete_time_pair_rejected(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-20",
        "name": "支援乙",
        "status": "support",
        "start_time": "08:00",
    })
    assert r.status_code == 400
    assert "成对" in r.json()["detail"]


def test_patch_support_clear_times(client):
    created = client.post("/api/entries", json={
        "work_date": "2026-08-21",
        "name": "支援丙",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
    }).json()
    r = client.patch(f"/api/entries/{created['id']}", json={
        "start_time": None,
        "end_time": None,
        "clear_times": True,
    })
    # 若 clear_times 语义不清，改为显式传 null 能清时段的现有 PATCH 约定
    assert r.status_code == 200
    assert r.json()["start_time"] is None
    assert r.json()["end_time"] is None
    assert r.json()["effective_hours"] == "0.0"
```

先查 `update_entry` / `EntryUpdate`：若 PATCH 用 `clear_times` 会清主时段，用它；否则用项目现有「显式 null」写法，保证测试能表达「有时段改为无时段」。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend; python -m pytest tests/test_entries_api.py::test_create_support_without_times_allowed tests/test_entries_api.py::test_create_support_incomplete_time_pair_rejected -v`

Expected: FAIL（无时段仍 400）

- [ ] **Step 3: 改 `_normalize_entry_fields`**

将 `status == "support"` 分支改为：

```python
    if status == "support":
        if is_external or is_trial:
            raise ValueError("支援不能标记外援或试工")
        if start_time is None and end_time is None:
            return status, False, False, None, None, False
        if start_time is None or end_time is None:
            raise ValueError("时段须成对填写")
        format_effective_hours(start_time, end_time)
        return status, False, False, start_time, end_time, False
```

并确认 `create_entry` / `update_entry` 在缺字段时把缺失的 start/end 当 `None`（已有则不动）。

若 PATCH 清时段需额外字段：阅读 `update_entry`，保证 `start_time=None, end_time=None` 能写入；必要时在测试里用项目已有的 clear 约定。

- [ ] **Step 4: 跑测试通过**

Run: `cd backend; python -m pytest tests/test_entries_api.py::test_create_support_without_times_allowed tests/test_entries_api.py::test_create_support_incomplete_time_pair_rejected tests/test_entries_api.py::test_patch_support_clear_times tests/test_entries_api.py::test_create_support_hours_returned_but_flags_forbidden -v`

Expected: PASS

- [ ] **Step 5: Commit（若用户已要求提交）**

```bash
git add backend/app/services/entries.py backend/tests/test_entries_api.py
git commit -m "支援新增/编辑允许不填时段，仅要求成对填写。"
```

---

### Task 2: Backend 文本导入 — 去掉 missing_support_times

**Files:**
- Modify: `backend/app/services/roster_text_import.py`
- Test: `backend/tests/test_roster_text_parse.py`
- Test: `backend/tests/test_roster_text_import_api.py`

**Interfaces:**
- Consumes: Task 1 的 create/update 可接受无时段 support
- Produces: `_validate_draft` 不再追加 `missing_support_times`；一边有一边无 → `incomplete_time_pair`

- [ ] **Step 1: 更新解析测试为期望无错误**

改 `backend/tests/test_roster_text_parse.py`：

```python
def test_parse_support_missing_times_error():
    text = "8月4 周二\n支援上社：洁怡"
    result = parse_roster_text(text, year=2026)
    e = result["days"][0]["entries"][0]
    assert e["status"] == "support"
    assert e["start_time"] is None
    assert e["end_time"] is None
    assert "missing_support_times" not in e["errors"]
    assert e["errors"] == []
```

（函数名可改为 `test_parse_support_without_times_ok`，并全局替换其它断言 `missing_support_times` 的地方：`test_parse_full_day` 中洁怡、`test_parse_support_per_person...` 中佳博/佳佳 —— 改为 `assert "missing_support_times" not in ...` 且无其它错误或仅保留合理错误。）

对「只有开始没有结束」的草稿，追加：

```python
def test_validate_support_incomplete_pair():
    from app.services.roster_text_import import _validate_draft
    entry = {
        "status": "support",
        "start_time": __import__("datetime").time(8, 0),
        "end_time": None,
        "ot_start_time": None,
        "ot_end_time": None,
        "errors": [],
    }
    _validate_draft(entry)
    assert "incomplete_time_pair" in entry["errors"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend; python -m pytest tests/test_roster_text_parse.py::test_parse_support_missing_times_error -v`

Expected: FAIL（仍有 missing_support_times）

- [ ] **Step 3: 改 `_validate_draft`**

```python
def _validate_draft(entry: dict) -> None:
    errors: list[str] = list(entry.get("errors") or [])
    start, end = entry["start_time"], entry["end_time"]
    ot_start, ot_end = entry["ot_start_time"], entry["ot_end_time"]
    status = entry["status"]

    main_invalid = start is not None and end is not None and end <= start
    ot_invalid = ot_start is not None and ot_end is not None and ot_end <= ot_start
    if (main_invalid or ot_invalid) and "invalid_time_range" not in errors:
        errors.append("invalid_time_range")

    main_incomplete = (start is None) != (end is None)
    if main_incomplete and "incomplete_time_pair" not in errors:
        errors.append("incomplete_time_pair")

    if status == _STATUS_ON_DUTY and (start is None or end is None) and not main_incomplete:
        if "missing_duty_times" not in errors:
            errors.append("missing_duty_times")

    entry["errors"] = errors
```

注意：不要再对 support 追加 `missing_support_times`。

- [ ] **Step 4: 更新 API 测试**

`test_preview_flags_support_without_times` → 改为无错误：

```python
def test_preview_allows_support_without_times(client):
    r = client.post("/api/entries/import/preview", json={"text": SAMPLE, "year": 2026})
    assert r.status_code == 200
    support = next(e for e in r.json()["days"][0]["entries"] if e["name"] == "洁怡")
    assert support["status"] == "support"
    assert "missing_support_times" not in support["errors"]
    assert support["errors"] == []
```

`test_commit_rejects_support_without_times` → 改为可提交：

```python
def test_commit_allows_support_without_times(client):
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
    assert r.status_code == 200
    listed = client.get("/api/entries", params={"date": "2026-08-01"}).json()
    row = next(e for e in listed if e["employee_name"] == "洁怡")
    assert row["status"] == "support"
    assert row["start_time"] is None
    assert row["effective_hours"] == "0.0"
```

- [ ] **Step 5: 跑相关测试**

Run: `cd backend; python -m pytest tests/test_roster_text_parse.py tests/test_roster_text_import_api.py -v`

Expected: PASS

- [ ] **Step 6: Commit（若用户已要求）**

```bash
git add backend/app/services/roster_text_import.py backend/tests/test_roster_text_parse.py backend/tests/test_roster_text_import_api.py
git commit -m "文本导入允许支援不填时段，半边时段用 incomplete_time_pair。"
```

---

### Task 3: Frontend SupportForm — 时段可选

**Files:**
- Modify: `frontend/src/components/SupportForm.jsx`

**Interfaces:**
- Consumes: API 接受 `start_time`/`end_time` 为 `null`
- Produces: 提交时空串 → `null`；缺一边禁用提交并提示

- [ ] **Step 1: 改默认值与提交归一化**

```javascript
const EMPTY = {
  name: '',
  start_time: '',
  end_time: '',
  ot_start_time: '',
  ot_end_time: '',
  note: '',
}

function timeOrNull(value) {
  return toTimeInputValue(value) || null
}

function isPairIncomplete(start, end) {
  return Boolean(toTimeInputValue(start)) !== Boolean(toTimeInputValue(end))
}

function entryToForm(entry) {
  if (!entry) return { ...EMPTY }
  return {
    name: entry.employee_name || '',
    start_time: toTimeInputValue(entry.start_time),
    end_time: toTimeInputValue(entry.end_time),
    ot_start_time: toTimeInputValue(entry.ot_start_time),
    ot_end_time: toTimeInputValue(entry.ot_end_time),
    note: entry.note || '',
  }
}
```

在 `handleSubmit` 中：

```javascript
  const mainIncomplete = isPairIncomplete(form.start_time, form.end_time)
  if (mainIncomplete || otIncomplete) return
  onSubmit?.({
    name: trimmed,
    start_time: timeOrNull(form.start_time),
    end_time: timeOrNull(form.end_time),
    ...normalizeOtTimes(form.ot_start_time, form.ot_end_time),
    note: form.note.trim() ? form.note.trim() : null,
    status: 'support',
  })
```

- [ ] **Step 2: UI — 去掉 required，加半边提示**

`TimeField` 的 `required` 去掉。

```jsx
      {mainIncomplete ? (
        <p className="entry-form__error">时段须成对填写</p>
      ) : null}
```

提交按钮：`disabled={busy || otIncomplete || mainIncomplete}`。

可选：无主时段时不渲染 `HoursBreakdown`（或传空时组件已显示 0 — 按现有组件行为，空则可不显示）。

```jsx
      {form.start_time && form.end_time ? (
        <HoursBreakdown startTime={form.start_time} endTime={form.end_time} />
      ) : null}
```

- [ ] **Step 3: 构建**

Run: `cd frontend; npm run build`

Expected: PASS

- [ ] **Step 4: Commit（若用户已要求）**

```bash
git add frontend/src/components/SupportForm.jsx
git commit -m "支援表单时段改为可选，须成对填写。"
```

---

### Task 4: Frontend 导入预览 — 对齐错误码

**Files:**
- Modify: `frontend/src/components/RosterTextImportModal.jsx`

- [ ] **Step 1: 更新 ERROR_LABEL 与 recomputeEntryErrors**

```javascript
const ERROR_LABEL = {
  missing_duty_times: '到岗须填写时段',
  invalid_time_range: '结束须晚于开始',
  incomplete_ot_times: '加班开始与结束须同时填写',
  incomplete_time_pair: '时段须成对填写',
}

function recomputeEntryErrors(entry) {
  const errors = []
  const status = entry.status || 'on_duty'
  const start = timeOrNull(entry.start_time)
  const end = timeOrNull(entry.end_time)
  const otStart = timeOrNull(entry.ot_start_time)
  const otEnd = timeOrNull(entry.ot_end_time)

  const mainInvalid = Boolean(start && end && end <= start)
  const otInvalid = Boolean(otStart && otEnd && otEnd <= start) // 注意：应为 otEnd <= otStart
  if (mainInvalid || otInvalid) errors.push('invalid_time_range')
  if (isPairIncomplete(otStart, otEnd)) errors.push('incomplete_ot_times')
  if (isPairIncomplete(start, end)) errors.push('incomplete_time_pair')

  if (status === 'on_duty' && (!start || !end) && !isPairIncomplete(start, end)) {
    errors.push('missing_duty_times')
  }

  return errors
}
```

**修正：** `otInvalid` 必须是 `otEnd <= otStart`，不要误写成 `otEnd <= start`。完整正确版本：

```javascript
  const otInvalid = Boolean(otStart && otEnd && otEnd <= otStart)
  if (mainInvalid || otInvalid) errors.push('invalid_time_range')
  if (isPairIncomplete(otStart, otEnd)) errors.push('incomplete_ot_times')
  if (isPairIncomplete(start, end)) errors.push('incomplete_time_pair')

  if (status === 'on_duty' && (!start || !end) && !isPairIncomplete(start, end)) {
    errors.push('missing_duty_times')
  }
```

删除对 `missing_support_times` 的任何引用。

- [ ] **Step 2: 构建**

Run: `cd frontend; npm run build`

Expected: PASS

- [ ] **Step 3: Commit（若用户已要求）**

```bash
git add frontend/src/components/RosterTextImportModal.jsx
git commit -m "导入预览：支援可不填时段，半边提示成对填写。"
```

---

### Task 5: 全量验收

- [ ] **Step 1: 后端**

Run: `cd backend; python -m pytest tests/test_entries_api.py tests/test_roster_text_parse.py tests/test_roster_text_import_api.py tests/test_stats_api.py -v`

Expected: PASS（统计用例不因无时段支援而失败；若有「支援必须有工时」的断言则按 spec 调整）

- [ ] **Step 2: 前端**

Run: `cd frontend; npm run build`

Expected: PASS

- [ ] **Step 3: 手动冒烟**

1. 日面板新增支援：不填时段 → 成功，列表显示支援、工时 0
2. 只填开始 → 无法提交 / 提示成对
3. 文本导入「支援上社：洁怡」无时段 → 预览无错误，可提交
4. 统计看板：该人支援天数 +1，支援工时 0.0

---

## Spec Self-Review

| Spec 要求 | Task |
|-----------|------|
| 新增/编辑无时段允许 | Task 1 |
| 只填一半拒绝 | Task 1, 3, 4 |
| 导入无时段允许 | Task 2, 4 |
| 统计天数+1 工时 0 | Task 1（自然满足）+ Task 5 冒烟 |
| 不改到岗/休息/Excel | 全 plan 未触碰 |

无 TBD。`incomplete_time_pair` 前后端一致。
