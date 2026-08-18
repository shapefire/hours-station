# 设置页花名册管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置弹窗增加花名册分区，支持单人添加、文本导入与软删移出。

**Architecture:** 沿用 `employees` 表与 `get_or_create_employee`。新增 `POST /api/employees` 与 `POST /api/employees/import`（服务端解析分隔符）。前端设置分区改名单后发 `roster-changed`，日历下拉订阅刷新。

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, Vite

## Global Constraints

- 删除是逻辑删（`is_active=false`），历史排班保留
- 导入：活跃跳过；软删同名复活
- 分隔符：空白（含换行/制表符）、`、`、`,`
- 在 `main` 上直接改；不改统计看板口径

---

### Task 1: Backend 解析 + POST + import

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/employees.py`
- Modify: `backend/app/routers/employees.py`
- Test: `backend/tests/test_employees_roster.py`

- [ ] 失败测试：切分去重、导入计数、单人 201/200、软删后复活
- [ ] `parse_roster_text` / `ensure_active_employee` / `import_employees`
- [ ] Router POST `""` 与 POST `/import`
- [ ] pytest 通过

### Task 2: 设置分区 UI + 事件刷新

**Files:**
- Create: `frontend/src/components/RosterSettingsPanel.jsx`
- Modify: `frontend/src/components/SettingsModal.jsx`
- Modify: `frontend/src/settings/events.js`
- Modify: `frontend/src/components/EmployeeNameField.jsx`
- Modify: `frontend/src/components/StatusMultiPick.jsx`
- Modify: `frontend/src/styles/global.css`

- [ ] 设置导航「花名册」：列表、单人添加、文本导入、移出确认
- [ ] `notifyRosterChanged`；姓名下拉与多选弹层订阅后重拉
- [ ] `npm run build`

### Task 3: Verify

- [ ] `python -m pytest tests/test_employees_roster.py tests/test_entries_api.py -v`
- [ ] `npm run build`
