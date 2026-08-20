# 花名册短名编辑与人员合并 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 花名册短名可编辑；撞名时合并两人；同日冲突与导出姓名/岗位由用户在弹窗中逐条选择。

**Architecture:** 扩展 `PATCH /api/employees/{id}` 支持 `name`，409 返回 `name_exists` 供前端弹合并流程。新增 `merge-preview` 与 `merge` 端点；合并迁移 `work_entries.employee_id` 并按 resolution 删冲突 entry。前端 `RosterSettingsPanel` 增加短名 input 与两个 modal。

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest, React 18, Vite

## Global Constraints

- 短名 `employees.name` 保持 UNIQUE；查重仅针对 `is_active=true`
- 合并：source = 改名者，target = 已存在同名活跃者；合并后 `source.is_active=false`
- 同日冲突：`keep` 为 `"source"` | `"target"`；未覆盖全部冲突日期 → 400
- 导出姓名/岗位合并：`export_name_keep` / `position_keep` 为 `"source"` | `"target"` | `"empty"`
- 导出姓名重复：前端黄色警告，不阻断 PATCH
- 删除仍是软删；不改统计口径、不改 entry 创建逻辑
- 在 `main` 上直接改

## File Map

| 文件 | 职责 |
|------|------|
| `backend/app/schemas.py` | `EmployeeUpdate.name`、`NameExistsOut`、merge 请求/响应模型 |
| `backend/app/services/employees.py` | `rename_employee`、`merge_preview`、`merge_employees`、扩展 `update_employee` |
| `backend/app/routers/employees.py` | PATCH 409、`GET /merge-preview`、`POST /merge` |
| `backend/tests/test_employees_roster.py` | rename / preview / merge 测试 |
| `frontend/src/components/RosterSettingsPanel.jsx` | 短名编辑、弹窗状态、export 警告 |
| `frontend/src/components/MergeConflictModal.jsx` | 新建：冲突表格 + export/position 选择 |
| `frontend/src/components/RenameConflictModal.jsx` | 新建：是否合并确认 |
| `frontend/src/styles/global.css` | modal / warning 样式 |

---

### Task 1: Backend schemas

**Files:**
- Modify: `backend/app/schemas.py`
- Test: `backend/tests/test_employees_roster.py`（本 task 仅 import 校验，无新测试）

**Interfaces:**
- Produces: `EmployeeUpdate` 含可选 `name`；`NameExistsOut`；`MergeEntrySummary`；`MergeConflictOut`；`MergePreviewOut`；`MergeResolutionIn`；`MergeIn`；`MergeOut`

- [ ] **Step 1: 扩展 `EmployeeUpdate` 并添加 merge 模型**

在 `backend/app/schemas.py` 的 `EmployeeUpdate` 后追加：

```python
class EmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    export_name: str | None = None
    position: str | None = None


class NameExistsOut(BaseModel):
    code: Literal["name_exists"] = "name_exists"
    existing_id: UUID
    existing_name: str


KeepSide = Literal["source", "target"]
FieldKeep = Literal["source", "target", "empty"]


class MergeEntrySummary(BaseModel):
    id: UUID
    status: EntryStatus
    start_time: time | None
    end_time: time | None
    ot_start_time: time | None
    ot_end_time: time | None
    is_external: bool
    is_trial: bool
    skip_deduction: bool
    note: str | None


class MergeConflictOut(BaseModel):
    work_date: date
    source_entry: MergeEntrySummary
    target_entry: MergeEntrySummary


class MergePreviewOut(BaseModel):
    source_name: str
    target_name: str
    source_export_name: str | None
    target_export_name: str | None
    source_position: str | None
    target_position: str | None
    movable_count: int
    conflicts: list[MergeConflictOut]


class MergeResolutionIn(BaseModel):
    work_date: date
    keep: KeepSide


class MergeIn(BaseModel):
    source_id: UUID
    target_id: UUID
    resolutions: list[MergeResolutionIn] = Field(default_factory=list)
    export_name_keep: FieldKeep = "target"
    position_keep: FieldKeep = "target"


class MergeOut(BaseModel):
    merged_entries: int
    discarded_entries: int
    target: EmployeeOut
```

在文件顶部确保已有 `from datetime import date, time` 与 `EntryStatus` import。

- [ ] **Step 2: 验证 import**

Run: `cd backend && python -c "from app.schemas import MergeIn, NameExistsOut; print('ok')"`
Expected: `ok`

---

### Task 2: Backend rename + PATCH 409

**Files:**
- Modify: `backend/app/services/employees.py`
- Modify: `backend/app/routers/employees.py`
- Test: `backend/tests/test_employees_roster.py`

**Interfaces:**
- Produces: `class NameConflictError(Exception)` with `.existing_id`, `.existing_name`；`rename_employee(db, employee_id, name) -> Employee`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_employees_roster.py` 末尾追加：

```python
def test_patch_employee_rename_success(client):
    emp = client.post("/api/employees", json={"name": "李四"}).json()
    client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "李四",
        "start_time": "09:00",
        "end_time": "18:00",
    })
    r = client.patch(f"/api/employees/{emp['id']}", json={"name": "李肆"})
    assert r.status_code == 200
    assert r.json()["name"] == "李肆"
    entries = client.get("/api/entries", params={"date": "2026-08-04"}).json()
    assert entries[0]["employee_name"] == "李肆"


def test_patch_employee_rename_conflict_409(client):
    a = client.post("/api/employees", json={"name": "李四"}).json()
    client.post("/api/employees", json={"name": "张三"})
    r = client.patch(f"/api/employees/{a['id']}", json={"name": "张三"})
    assert r.status_code == 409
    body = r.json()["detail"]
    assert body["code"] == "name_exists"
    assert body["existing_name"] == "张三"


def test_patch_employee_rename_same_name_noop(client):
    emp = client.post("/api/employees", json={"name": "李四"}).json()
    r = client.patch(f"/api/employees/{emp['id']}", json={"name": "李四"})
    assert r.status_code == 200
    assert r.json()["name"] == "李四"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_employees_roster.py::test_patch_employee_rename_success tests/test_employees_roster.py::test_patch_employee_rename_conflict_409 -v`
Expected: FAIL（rename 未实现或 409 未返回）

- [ ] **Step 3: 实现 `NameConflictError` 与 `rename_employee`**

在 `backend/app/services/employees.py` 顶部追加：

```python
class NameConflictError(Exception):
    def __init__(self, existing_id: UUID, existing_name: str):
        self.existing_id = existing_id
        self.existing_name = existing_name
        super().__init__(existing_name)
```

在 `update_employee` 中，当 `"name" in fields` 时委托 `rename_employee`；或直接在 `update_employee` 内处理 name 字段：

```python
def rename_employee(db: Session, employee_id: UUID, raw_name: str) -> Employee:
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise KeyError("员工不存在")
    cleaned = raw_name.strip()
    if not cleaned:
        raise ValueError("姓名不能为空")
    if len(cleaned) > 64:
        raise ValueError("姓名最长 64 字")
    if emp.name == cleaned:
        return emp
    conflict = db.scalars(
        select(Employee).where(
            Employee.name == cleaned,
            Employee.is_active.is_(True),
            Employee.id != employee_id,
        )
    ).one_or_none()
    if conflict is not None:
        raise NameConflictError(conflict.id, conflict.name)
    emp.name = cleaned
    db.flush()
    return emp
```

修改 `update_employee`：

```python
def update_employee(db: Session, employee_id: UUID, fields: dict) -> Employee:
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise KeyError("员工不存在")
    if "name" in fields:
        emp = rename_employee(db, employee_id, fields["name"])
    for key in ("export_name", "position"):
        if key not in fields:
            continue
        # ... 保持现有逻辑不变 ...
    db.flush()
    return emp
```

- [ ] **Step 4: Router 返回 409**

修改 `backend/app/routers/employees.py`：

```python
from app.schemas import NameExistsOut, ...
from app.services.employees import NameConflictError, ...

@router.patch("/{employee_id}", response_model=EmployeeOut)
def patch_employee(...):
    fields = payload.model_dump(exclude_unset=True)
    try:
        emp = employees_service.update_employee(db, employee_id, fields)
    except NameConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=NameExistsOut(
                existing_id=exc.existing_id,
                existing_name=exc.existing_name,
            ).model_dump(),
        ) from exc
    except KeyError as exc:
        ...
```

- [ ] **Step 5: 运行测试**

Run: `cd backend && python -m pytest tests/test_employees_roster.py::test_patch_employee_rename_success tests/test_employees_roster.py::test_patch_employee_rename_conflict_409 tests/test_employees_roster.py::test_patch_employee_rename_same_name_noop -v`
Expected: PASS

---

### Task 3: Backend merge-preview

**Files:**
- Modify: `backend/app/services/employees.py`
- Modify: `backend/app/routers/employees.py`
- Test: `backend/tests/test_employees_roster.py`

**Interfaces:**
- Produces: `merge_preview(db, source_id, target_id) -> dict`；`GET /api/employees/merge-preview`

- [ ] **Step 1: 写失败测试**

```python
def _entry(client, work_date, name, **kwargs):
    payload = {
        "work_date": work_date,
        "name": name,
        "start_time": "09:00",
        "end_time": "18:00",
    }
    payload.update(kwargs)
    return client.post("/api/entries", json=payload)


def test_merge_preview_lists_conflicts(client):
    a = client.post("/api/employees", json={"name": "李四"}).json()
    b = client.post("/api/employees", json={"name": "张三"}).json()
    _entry(client, "2026-08-05", "李四")
    _entry(client, "2026-08-05", "张三", status="rest")
    _entry(client, "2026-08-06", "李四")

    r = client.get("/api/employees/merge-preview", params={
        "source_id": a["id"], "target_id": b["id"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["movable_count"] == 1
    assert len(body["conflicts"]) == 1
    assert body["conflicts"][0]["work_date"] == "2026-08-05"
    assert body["conflicts"][0]["source_entry"]["status"] == "on_duty"
    assert body["conflicts"][0]["target_entry"]["status"] == "rest"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_employees_roster.py::test_merge_preview_lists_conflicts -v`
Expected: FAIL（404 或 route 不存在）

- [ ] **Step 3: 实现 `merge_preview`**

```python
from app.models import WorkEntry

def _entry_summary(entry: WorkEntry) -> dict:
    return {
        "id": entry.id,
        "status": entry.status,
        "start_time": entry.start_time,
        "end_time": entry.end_time,
        "ot_start_time": entry.ot_start_time,
        "ot_end_time": entry.ot_end_time,
        "is_external": entry.is_external,
        "is_trial": entry.is_trial,
        "skip_deduction": bool(getattr(entry, "skip_deduction", False)),
        "note": entry.note,
    }


def _require_active_pair(db: Session, source_id: UUID, target_id: UUID) -> tuple[Employee, Employee]:
    if source_id == target_id:
        raise ValueError("不能合并同一人")
    source = db.get(Employee, source_id)
    target = db.get(Employee, target_id)
    if source is None or target is None:
        raise KeyError("员工不存在")
    if not source.is_active or not target.is_active:
        raise ValueError("只能合并活跃人员")
    return source, target


def merge_preview(db: Session, source_id: UUID, target_id: UUID) -> dict:
    source, target = _require_active_pair(db, source_id, target_id)
    source_entries = list(
        db.scalars(select(WorkEntry).where(WorkEntry.employee_id == source.id)).all()
    )
    target_by_date = {
        e.work_date: e
        for e in db.scalars(select(WorkEntry).where(WorkEntry.employee_id == target.id)).all()
    }
    conflicts: list[dict] = []
    movable_count = 0
    for entry in sorted(source_entries, key=lambda e: e.work_date):
        other = target_by_date.get(entry.work_date)
        if other is not None:
            conflicts.append({
                "work_date": entry.work_date,
                "source_entry": _entry_summary(entry),
                "target_entry": _entry_summary(other),
            })
        else:
            movable_count += 1
    return {
        "source_name": source.name,
        "target_name": target.name,
        "source_export_name": source.export_name,
        "target_export_name": target.export_name,
        "source_position": source.position,
        "target_position": target.position,
        "movable_count": movable_count,
        "conflicts": conflicts,
    }
```

- [ ] **Step 4: 注册路由（须在 `/{employee_id}` 之前）**

```python
@router.get("/merge-preview", response_model=MergePreviewOut)
def get_merge_preview(
    source_id: UUID = Query(...),
    target_id: UUID = Query(...),
    db: Session = Depends(get_db),
):
    try:
        data = employees_service.merge_preview(db, source_id, target_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0])) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=_exc_detail(exc)) from exc
    return MergePreviewOut.model_validate(data)
```

- [ ] **Step 5: 运行测试**

Run: `cd backend && python -m pytest tests/test_employees_roster.py::test_merge_preview_lists_conflicts -v`
Expected: PASS

---

### Task 4: Backend merge 执行

**Files:**
- Modify: `backend/app/services/employees.py`
- Modify: `backend/app/routers/employees.py`
- Test: `backend/tests/test_employees_roster.py`

**Interfaces:**
- Produces: `merge_employees(db, source_id, target_id, resolutions, export_name_keep, position_keep) -> dict`

- [ ] **Step 1: 写失败测试**

```python
def test_merge_moves_entries_and_deactivates_source(client):
    a = client.post("/api/employees", json={"name": "李四"}).json()
    b = client.post("/api/employees", json={"name": "张三"}).json()
    client.patch(f"/api/employees/{a['id']}", json={
        "export_name": "李四全名", "position": "收银",
    })
    client.patch(f"/api/employees/{b['id']}", json={
        "export_name": "张三全名", "position": "理货",
    })
    _entry(client, "2026-08-05", "李四")
    _entry(client, "2026-08-05", "张三", status="rest")
    _entry(client, "2026-08-06", "李四")

    r = client.post("/api/employees/merge", json={
        "source_id": a["id"],
        "target_id": b["id"],
        "resolutions": [{"work_date": "2026-08-05", "keep": "source"}],
        "export_name_keep": "source",
        "position_keep": "target",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["merged_entries"] == 2
    assert body["discarded_entries"] == 1
    assert body["target"]["export_name"] == "李四全名"
    assert body["target"]["position"] == "理货"

    names = [e["name"] for e in client.get("/api/employees").json()]
    assert "李四" not in names
    assert "张三" in names

    entries = client.get("/api/entries", params={"date": "2026-08-05"}).json()
    assert len(entries) == 1
    assert entries[0]["employee_name"] == "张三"
    assert entries[0]["status"] == "on_duty"

    entries6 = client.get("/api/entries", params={"date": "2026-08-06"}).json()
    assert len(entries6) == 1
    assert entries6[0]["employee_name"] == "张三"


def test_merge_rejects_incomplete_resolutions(client):
    a = client.post("/api/employees", json={"name": "李四"}).json()
    b = client.post("/api/employees", json={"name": "张三"}).json()
    _entry(client, "2026-08-05", "李四")
    _entry(client, "2026-08-05", "张三", status="rest")
    r = client.post("/api/employees/merge", json={
        "source_id": a["id"],
        "target_id": b["id"],
        "resolutions": [],
    })
    assert r.status_code == 400
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_employees_roster.py::test_merge_moves_entries_and_deactivates_source -v`
Expected: FAIL

- [ ] **Step 3: 实现 `merge_employees`**

```python
def _apply_field_keep(source: Employee, target: Employee, field: str, keep: str) -> None:
    if keep == "empty":
        setattr(target, field, None)
        return
    chosen = source if keep == "source" else target
    setattr(target, field, getattr(chosen, field))


def merge_employees(
    db: Session,
    source_id: UUID,
    target_id: UUID,
    resolutions: list[dict],
    *,
    export_name_keep: str = "target",
    position_keep: str = "target",
) -> dict:
    source, target = _require_active_pair(db, source_id, target_id)
    preview = merge_preview(db, source_id, target_id)
    conflict_dates = {c["work_date"] for c in preview["conflicts"]}
    resolution_map = {r["work_date"]: r["keep"] for r in resolutions}
    if set(resolution_map.keys()) != conflict_dates:
        raise ValueError("冲突日期 resolution 不完整")

    merged_entries = 0
    discarded_entries = 0

    source_entries = list(
        db.scalars(select(WorkEntry).where(WorkEntry.employee_id == source.id)).all()
    )
    target_by_date = {
        e.work_date: e
        for e in db.scalars(select(WorkEntry).where(WorkEntry.employee_id == target.id)).all()
    }

    for entry in source_entries:
        other = target_by_date.get(entry.work_date)
        if other is None:
            entry.employee_id = target.id
            merged_entries += 1
            continue
        keep = resolution_map[entry.work_date]
        if keep == "source":
            db.delete(other)
            entry.employee_id = target.id
            merged_entries += 1
        else:
            db.delete(entry)
            discarded_entries += 1

    _apply_field_keep(source, target, "export_name", export_name_keep)
    _apply_field_keep(source, target, "position", position_keep)
    source.is_active = False
    db.flush()

    return {
        "merged_entries": merged_entries,
        "discarded_entries": discarded_entries,
        "target": target,
    }
```

- [ ] **Step 4: 注册 POST 路由**

```python
@router.post("/merge", response_model=MergeOut)
def post_merge(payload: MergeIn, db: Session = Depends(get_db)):
    resolutions = [r.model_dump() for r in payload.resolutions]
    try:
        result = employees_service.merge_employees(
            db,
            payload.source_id,
            payload.target_id,
            resolutions,
            export_name_keep=payload.export_name_keep,
            position_keep=payload.position_keep,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0])) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=_exc_detail(exc)) from exc
    target = result.pop("target")
    return MergeOut(
        merged_entries=result["merged_entries"],
        discarded_entries=result["discarded_entries"],
        target=EmployeeOut.model_validate(target),
    )
```

- [ ] **Step 5: 运行 merge 测试**

Run: `cd backend && python -m pytest tests/test_employees_roster.py::test_merge_moves_entries_and_deactivates_source tests/test_employees_roster.py::test_merge_rejects_incomplete_resolutions -v`
Expected: PASS

- [ ] **Step 6: 运行全部 roster 测试**

Run: `cd backend && python -m pytest tests/test_employees_roster.py -v`
Expected: 全部 PASS

---

### Task 5: Frontend 短名编辑 + 409 触发合并

**Files:**
- Modify: `frontend/src/components/RosterSettingsPanel.jsx`
- Create: `frontend/src/components/RenameConflictModal.jsx`

**Interfaces:**
- Consumes: `PATCH /api/employees/{id}` 409 `detail.code === 'name_exists'`
- Produces: 状态 `pendingRename: { id, oldName, newName, existingId, existingName }`

- [ ] **Step 1: 短名 `<input>` 替换 `<span>`**

在 `RosterSettingsPanel.jsx` 中，将：

```jsx
<span className="settings-modal__item-text">{emp.name}</span>
```

改为：

```jsx
<input
  type="text"
  className="roster-row__field roster-row__field--name"
  aria-label={`${emp.name} 短名`}
  value={emp.name}
  disabled={busy}
  maxLength={64}
  onChange={(e) => updateLocal(emp.id, 'name', e.target.value)}
  onBlur={() => saveName(emp.id)}
  onKeyDown={(e) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }}
/>
```

- [ ] **Step 2: 实现 `saveName`**

```javascript
const [pendingRename, setPendingRename] = useState(null)

async function saveName(id) {
  const emp = rosterRef.current.find((row) => row.id === id)
  if (!emp || busy) return
  const value = typeof emp.name === 'string' ? emp.name.trim() : ''
  const original = roster.find((row) => row.id === id)?.name?.trim?.() ?? emp.name
  if (!value || value === original) {
    if (value !== emp.name) updateLocal(id, 'name', original)
    return
  }
  setBusy(true)
  setError(null)
  try {
    const body = await api.patch(`/api/employees/${id}`, { name: value })
    setRoster((prev) => {
      const next = prev.map((row) => (row.id === id ? { ...row, name: body.name } : row))
      rosterRef.current = next
      return next
    })
    notifyRosterChanged()
  } catch (err) {
    if (err?.status === 409 && err?.body?.code === 'name_exists') {
      setPendingRename({
        id,
        oldName: original,
        newName: value,
        existingId: err.body.existing_id,
        existingName: err.body.existing_name,
      })
      return
    }
    await loadRoster()
    setError(err?.message || '保存失败，请稍后重试')
  } finally {
    setBusy(false)
  }
}

function cancelPendingRename() {
  if (!pendingRename) return
  updateLocal(pendingRename.id, 'name', pendingRename.oldName)
  setPendingRename(null)
}
```

确认 `frontend/src/api/client.js` 在 409 时把 JSON body 挂到 `err.body`；若无则扩展 client。

- [ ] **Step 3: 创建 `RenameConflictModal.jsx`**

```jsx
export default function RenameConflictModal({
  oldName,
  newName,
  busy,
  onCancel,
  onContinue,
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2 className="modal__title">合并人员</h2>
        </header>
        <div className="modal__body">
          <p>「{newName}」已在花名册中。</p>
          <p>是否将「{oldName}」合并到「{newName}」？</p>
          <ul className="settings-modal__hint">
            <li>{oldName} 的历史排班归入 {newName}</li>
            <li>{oldName} 从花名册移除（历史保留）</li>
          </ul>
        </div>
        <footer className="modal__footer">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={onContinue}>
            继续合并
          </button>
        </footer>
      </div>
    </div>
  )
}
```

在 `RosterSettingsPanel` 中渲染；`onContinue` 打开 Task 6 的 `MergeConflictModal`。

---

### Task 6: Frontend MergeConflictModal

**Files:**
- Create: `frontend/src/components/MergeConflictModal.jsx`
- Modify: `frontend/src/components/RosterSettingsPanel.jsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- Consumes: `GET /api/employees/merge-preview?source_id=&target_id=`；`POST /api/employees/merge`

- [ ] **Step 1: 创建 `MergeConflictModal.jsx`**

核心 state：
- `preview`（API 响应）
- `resolutions: Record<work_date, 'source'|'target'>`
- `exportNameKeep`, `positionKeep`（`'source'|'target'|'empty'`）

```jsx
function entryLabel(entry) {
  const statusMap = { on_duty: '在岗', rest: '休息', leave: '请假', support: '支援' }
  const parts = [statusMap[entry.status] || entry.status]
  if (entry.start_time && entry.end_time) parts.push(`${entry.start_time}–${entry.end_time}`)
  if (entry.note) parts.push(entry.note)
  return parts.join(' · ')
}

function FieldChoice({ label, sourceValue, targetValue, value, onChange }) {
  const same = (sourceValue || '') === (targetValue || '')
  if (same) return null
  return (
    <fieldset className="merge-field-choice">
      <legend>{label}</legend>
      <label><input type="radio" checked={value === 'source'} onChange={() => onChange('source')} />{sourceValue || '（空）'}</label>
      <label><input type="radio" checked={value === 'target'} onChange={() => onChange('target')} />{targetValue || '（空）'}</label>
      <label><input type="radio" checked={value === 'empty'} onChange={() => onChange('empty')} />留空</label>
    </fieldset>
  )
}
```

`useEffect` 挂载时 `GET merge-preview`；默认 `exportNameKeep`/`positionKeep` 选有值方。

冲突表格每行两个 radio：`keep source` / `keep target`。

「确认合并」disabled 当：
- `preview.conflicts.some(c => !resolutions[c.work_date])`

提交：

```javascript
await api.post('/api/employees/merge', {
  source_id: sourceId,
  target_id: targetId,
  resolutions: Object.entries(resolutions).map(([work_date, keep]) => ({ work_date, keep })),
  export_name_keep: exportNameKeep,
  position_keep: positionKeep,
})
```

- [ ] **Step 2: 在 `RosterSettingsPanel` 串联流程**

```javascript
const [mergeCtx, setMergeCtx] = useState(null)

async function continueMerge() {
  const { id, oldName, existingId, existingName } = pendingRename
  setPendingRename(null)
  setMergeCtx({ sourceId: id, sourceName: oldName, targetId: existingId, targetName: existingName })
}

async function finishMerge() {
  setMergeCtx(null)
  notifyRosterChanged()
  await loadRoster()
  setStatus('合并完成')
}
```

- [ ] **Step 3: CSS**

在 `global.css` 追加：

```css
.roster-row__field--name { min-width: 5rem; font-weight: 500; }
.merge-field-choice { margin-bottom: 1rem; border: none; }
.merge-field-choice label { margin-right: 1rem; }
.merge-conflict-table { width: 100%; font-size: 0.875rem; }
.merge-conflict-table td { vertical-align: top; padding: 0.35rem 0.5rem; }
.settings-modal__warn { color: var(--color-warning, #b45309); font-size: 0.8125rem; margin-top: 0.25rem; }
```

- [ ] **Step 4: 构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

---

### Task 7: 导出姓名重复警告

**Files:**
- Modify: `frontend/src/components/RosterSettingsPanel.jsx`

- [ ] **Step 1: 实现 `exportNameWarning(empId, exportName)`**

```javascript
function exportNameWarning(empId, exportName) {
  const trimmed = (exportName || '').trim()
  if (!trimmed) return null
  const other = rosterRef.current.find(
    (row) =>
      row.id !== empId &&
      (row.name === trimmed || (row.export_name || '').trim() === trimmed),
  )
  if (!other) return null
  const label = other.export_name?.trim() === trimmed && other.export_name !== other.name
    ? other.export_name
    : other.name
  return `导出姓名与「${label}」相同，Excel 导出时可能混淆`
}
```

在导出姓名 `<input>` 下方条件渲染：

```jsx
{exportNameWarning(emp.id, emp.export_name) ? (
  <p className="settings-modal__warn">{exportNameWarning(emp.id, emp.export_name)}</p>
) : null}
```

若行布局过挤，警告放在 export_name 单元格内。

- [ ] **Step 2: 构建**

Run: `cd frontend && npm run build`
Expected: PASS

---

### Task 8: 全量验收

- [ ] **Step 1: 后端全量**

Run: `cd backend && python -m pytest tests/test_employees_roster.py -v`
Expected: 全部 PASS

- [ ] **Step 2: 前端构建**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 3: 手动冒烟**

1. 设置 → 花名册：改短名无冲突 → 下拉同步新名
2. 李四改名为张三（张三已存在）→ 合并确认 → 选冲突 → 李四消失、排班归张三
3. 两人导出姓名相同 → 黄色警告、仍可保存

---

## Spec Self-Review

| Spec 要求 | 对应 Task |
|-----------|-----------|
| 短名可编辑 | Task 5 |
| 409 撞名合并 | Task 2, 5 |
| merge-preview 冲突列表 | Task 3, 6 |
| 同日逐条选择 | Task 4, 6 |
| export/position 用户选择 | Task 4, 6 |
| 导出姓名警告 | Task 7 |
| notifyRosterChanged | Task 5, 6 |
| inactive 同名不通过活跃查重 | Task 2（仅 active 查重） |

无 TBD / 占位符。
