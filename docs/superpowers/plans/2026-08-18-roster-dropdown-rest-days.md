# 花名册下拉状态徽章与当月已休息 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 姓名下拉与休息/请假弹层同行展示彩色状态徽章，并新增当月已休息天数列（只计 `status=rest`）。

**Architecture:** 后端在 `list_employees` 聚合 `month_rest_days`；前端抽取 `RosterStatusBadge` 共用组件；`EmployeeNameField` 三列 grid；`StatusMultiPick` 两列并传入年月。

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, Vite

## Global Constraints

- 已休息口径：只计本月 `status = rest` 登记天数
- 未占用人员不显示状态徽章
- 统计看板休息天数公式不变
- 弹层不展示当月已排工时

---

### Task 1: Backend `month_rest_days`

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/employees.py`
- Modify: `backend/tests/test_entries_api.py`

- [ ] Add failing test for `month_rest_days`
- [ ] Implement `_month_rest_days_by_employee` + schema field
- [ ] Run pytest

### Task 2: Shared `RosterStatusBadge` + CSS badges

**Files:**
- Create: `frontend/src/components/RosterStatusBadge.jsx`
- Modify: `frontend/src/styles/global.css`

### Task 3: `EmployeeNameField` three-column layout

**Files:**
- Modify: `frontend/src/components/EmployeeNameField.jsx`
- Modify: `frontend/src/styles/global.css`

### Task 4: `StatusMultiPick` + `DayPanel` wiring

**Files:**
- Modify: `frontend/src/components/StatusMultiPick.jsx`
- Modify: `frontend/src/components/DayPanel.jsx`
- Modify: `frontend/src/styles/global.css`

### Task 5: Verify

- [ ] `pytest backend/tests/test_entries_api.py -v`
- [ ] `cd frontend && npm run build`
