# 统计看板 Rest/Leave/未安排 口径修正 + 请假天数列

## 日期
2026-08-19

## 背景
统计看板目前存在两类问题：
1. “休息天数”口径不符合业务含义：它把“未安排（无登记）”以及“请假（leave）”混入了休息天数。
2. 统计看板缺少“请假天数”列。

## 目标
1. 统计看板：
   - `休息天数` 只统计已安排的休息（`status=rest`）。
   - 未安排天（该员工在该日无 `WorkEntry`）在逐日明细中显示为 `未安排`，且不计入休息天数/请假天数。
   - 新增 `请假天数` 列：按当月 `status=leave` 的 `work_date` 去重计数。
2. 逐日明细：
   - 当日无记录（`WorkEntry` 不存在）时 `status` 返回 `unassigned`，前端展示 `未安排`，并显示 `—`（不显示工时）。

## 非目标
- 不更改工时计算逻辑（`effective_hours` 的计算保持现状）。
- 不重构统计看板的排序逻辑或表格布局样式（仅为新增列做必要结构调整）。

## 当前实现（问题根因）
### 后端：`monthly_stats()`
当前 `rest_days` 通过：
- `rest_days = days_in_month - attendance_days - support_days`

这会将以下天都算入“休息天数”：
- `status=leave` 的天
- 未安排（无任何 `WorkEntry`）的天

### 后端：`employee_month_days()`
当前当 `entry is None` 时，逐日明细 `status` 被设为 `rest`，导致“未安排”显示为“休息”。

### 前端：`StatsPeopleTable`
当前表头有：
- 出勤天数
- 休息天数
- 支援天数/支援工时
但没有“请假天数”列。

## 方案概述（推荐方案 A）
后端显式区分三类“天”状态：
1. 已出勤：`on_duty`
2. 已休息：`rest`
3. 已请假：`leave`
4. 未安排：无 `WorkEntry` 记录（返回 `unassigned`）

并在前端据此展示：
- `休息天数`=rest 去重数
- `请假天数`=leave 去重数
- 展开逐日明细时 `unassigned` 显示“未安排”，工时显示 `—`。

## 详细设计
### 1) 数据模型/Schema 调整（后端）
文件：`backend/app/schemas.py`
1. `StatsPersonOut` 新增字段：
   - `leave_days: int`
2. `StatsDayOut.status` 的 `Literal` 扩展为：
   - 增加 `unassigned`

### 2) 月度统计口径修正（后端）
文件：`backend/app/services/stats.py`
1. `monthly_stats()`：
   - 计算：
     - `attendance_days`：`status=on_duty` 的 `work_date` 去重数
     - `rest_days`：`status=rest` 的 `work_date` 去重数
     - `leave_days`：`status=leave` 的 `work_date` 去重数
     - `support_days`：`status=support` 的 `work_date` 去重数
   - `rest_days` 不再使用“剩余天数”公式推导。
   - `total_hours` 保持原逻辑：继续把 `rest/leave` 的有效工时计入总工时（仅口径调整 days 统计，不改工时）。

2. `employee_month_days()`：
   - 若 `entry is None`：
     - `status = "unassigned"`
     - `effective_hours = None`
     - `start_time/end_time = None`

### 3) 统计看板展示更新（前端）
文件：`frontend/src/components/StatsPeopleTable.jsx`
1. 表头增加一列：
   - 在“休息天数”之后加入“请假天数”
2. 渲染新增字段：
   - `<Metric value={person.leave_days} unit="天" chip />`
3. 展开明细的 `colSpan`：
   - 从 8 调整为 9（因为新增一列）

文件：`frontend/src/components/StatsPeopleTable.jsx`（DayDetailList）
1. `dayStatusLabel(day)`：
   - `unassigned` 返回 `未安排`
2. `showHours`：
   - `unassigned` 时同样显示 `—`（不显示工时）

### 4) 测试计划（后端）
需要更新/新增以下测试用例：
1. `backend/tests/test_stats_api.py`
   - `test_monthly_stats_summary_and_rest_days`
   - `test_monthly_stats_support_not_in_store_hours_or_rest`
   - `test_employee_month_days_covers_full_month_with_rest`
2. 新增用例建议：
   - 当某员工仅有 `on_duty` + `leave` 时，`rest_days` 应为 0（之前会被算成大量剩余天数）。
   - `employee_month_days` 中未安排天应返回 `status="unassigned"`。

## 影响范围
- API：`/api/stats/monthly` 的 `people[]` 内新增 `leave_days`
- API：`/api/stats/monthly/{employee_id}/days` 的逐日明细新增 `unassigned` 状态
- 前端：统计看板列增加 + 日明细状态显示调整

## 回滚策略
若发现前端兼容性问题，可先仅引入字段/状态的“向后兼容渲染”（保留旧 rest_days 口径），但本需求要求口径变更，最终应完整回滚到旧逻辑并移除字段。

