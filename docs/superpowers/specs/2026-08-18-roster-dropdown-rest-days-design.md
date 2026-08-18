# 花名册下拉 / 休息请假弹层：状态徽章与当月已休息天数

日期：2026-08-18  
状态：已确认（brainstorming）  
范围：姓名组合框（`EmployeeNameField`）与休息/请假多选弹层（`StatusMultiPick`）  
相关代码：`frontend/src/components/EmployeeNameField.jsx`、`frontend/src/components/StatusMultiPick.jsx`、`frontend/src/components/DayPanel.jsx`、`backend/app/services/employees.py`、`backend/app/schemas.py`

---

## 1. 背景

当前姓名下拉在传入月历时已展示「当月已排工时」，但当日占用状态（到岗 / 休息 / 请假 / 支援）被 CSS 强制换到下一行（`grid-column: 1 / -1`），与姓名不在同一行，扫读不便。

休息/请假多选弹层同样只显示姓名与「已{状态}」文字提示，无样式区分，也无当月休息统计。

管理者在排班时需要快速判断：此人今天是否已被占用、本月已休息多少天。

## 2. 目标

1. **姓名下拉**与**休息/请假弹层**统一行结构：姓名与状态徽章同一行；数字列右对齐。
2. 当日占用状态用**彩色徽章**明显区分（到岗 / 休息 / 请假 / 支援）。
3. 新增**当月已休息天数**列：只统计本月 `status = rest` 的登记天数。
4. 未占用人员不显示状态徽章（列表更干净）。

## 3. 非目标

- 不改统计看板的「休息天数」公式（仍为 `当月天数 − 出勤 − 支援`）。
- 休息/请假弹层不展示「当月已排工时」。
- 不为未占用人员显示「未排」占位。
- 不改占用互斥、键盘导航、花名册软删等现有交互。

## 4. 已确认决策

| 项 | 选择 |
|----|------|
| 范围 | 姓名下拉 + 休息/请假弹层（B） |
| 已休息口径 | 只计本月 `status = rest` 的登记天数（C） |
| 未占用展示 | 仅显示姓名，不出状态徽章（A） |
| 布局方案 | 姓名旁 inline 徽章 + 数字列（方案 1） |

## 5. 界面规格

### 5.1 姓名下拉（EmployeeNameField）

表头（传入 `monthYear` + `month` 时）：

```text
姓名                    当月已排    已休息
```

行示例：

```text
张三  [休息]             12.5h       4天
李四                     8.0h        0天
王五  [到岗]             16.0h       2天
```

- **姓名列**：姓名 + 可选状态徽章（同一 flex 行，姓名过长 ellipsis）。
- **当月已排**：沿用现有 `Metric` chip，单位 `h`；数据来自 `month_hours`。
- **已休息**：`Metric` chip，单位 `天`；数据来自 `month_rest_days`；无记录显示 `0天`。
- **占用行**：仍不可选；移除「已{状态}」换行 hint，改由 inline 徽章表达。
- **未传年月**：不显示表头与两列数字（与现 `month_hours` 行为一致）。

### 5.2 休息/请假弹层（StatusMultiPick）

表头（传入 `monthYear` + `month` 时）：

```text
姓名                    已休息
```

行结构：checkbox + 姓名 + 可选徽章 | 已休息天数。

- 不展示「当月已排工时」。
- 占用禁用规则不变；当前弹层对应状态（如休息弹层中的「已休息」）仍可选。

### 5.3 状态徽章样式

复用现有 `.badge` 体系，新增四类 roster 专用 modifier：

| 状态 | 文案 | 色系（对齐现有 tokens） |
|------|------|-------------------------|
| `on_duty` | 到岗 | 墨绿 `--accent` |
| `rest` | 休息 | 褐金 `--rest` |
| `leave` | 请假 | 酒红 `#6b2a28`（对齐 stats leave） |
| `support` | 支援 | 蓝 `#3b82c4`（对齐 badge--external） |

徽章仅在 `occupiedMap[name]` 有值时渲染；禁用行上徽章保持全色，不因整行 opacity 变灰（徽章自身不继承 muted）。

### 5.4 共享组件

抽取轻量 **`RosterStatusBadge`**（或同等 inline 组件）：接收 `statusLabel`（到岗/休息/请假/支援），供 `EmployeeNameField` 与 `StatusMultiPick` 共用，避免两套 badge 逻辑。

## 6. 数据与 API

### 6.1 接口

沿用 `GET /api/employees?year=&month=`。当 `year` 与 `month` 同时提供时，响应增加：

| 字段 | 类型 | 说明 |
|------|------|------|
| `month_rest_days` | `int` | 该员工在该自然月内 `status = rest` 的登记天数 |

现有 `month_hours` 行为不变。

不带年月时：`month_hours` 与 `month_rest_days` 均为 `null`（响应中省略或 null，与 `month_hours` 一致）。

### 6.2 计算规则（口径 C）

```python
# 伪代码
for entry in work_entries where work_date in [month_start, month_end]:
    if entry.status == "rest":
        count_per_employee[entry.employee_id] += 1
```

- **计入**：`status = rest` 的 `work_entries`（按 `employee_id` 聚合，每条记 1 天）。
- **不计入**：`leave`、`on_duty`、`support`、其它月份、未登记日。
- **默认值**：无 rest 记录 → `0`。
- **与统计看板**：统计看板 `rest_days = 当月天数 − 出勤 − 支援` 不变；下拉中的「已休息」是独立指标，仅供排班参考。

### 6.3 前端数据流

| 组件 | 年月来源 | 当日状态来源 |
|------|----------|--------------|
| `EmployeeNameField` | 已有 `monthYear` / `month` props | `occupiedMap` prop |
| `StatusMultiPick` | 新增 `monthYear` / `month` props，由 `DayPanel` 传入 | `occupiedMap` prop（已有） |

`StatusMultiPick` 请求改为：`GET /api/employees?year=&month=`（与姓名下拉一致）。

## 7. 边界行为

| 场景 | 行为 |
|------|------|
| 当天 rest | 徽章「休息」；计入当月已休息（含今天） |
| 当天 leave | 徽章「请假」；**不**计入已休息 |
| 当天 on_duty / support | 对应徽章；不计入已休息 |
| 休息弹层中已选为 rest 的人 | 仍可选（`allowStatusLabel` 逻辑不变） |
| 姓名过长 | ellipsis；徽章不换行 |
| 切换月份 | 重新请求，重算 `month_hours` 与 `month_rest_days` |
| 自由输入新姓名 | 不在列表项中，无天数列 |
| API 失败 | 提示「花名册加载失败」，不编造数据 |

## 8. 实现要点

### 8.1 后端

- `employees.py`：新增 `_month_rest_days_by_employee(db, year, month)`，在 `list_employees` 中与 `_month_hours_by_employee` 并行调用。
- `schemas.py`：`EmployeeOut` 增加 `month_rest_days: int | None = None`。
- 测试：新增或扩展 `test_entries_api.py` / 专用 employees 测试。

### 8.2 前端

- `EmployeeNameField.jsx`：调整 grid 为三列；inline 徽章；移除 `name-field__option-hint` 换行。
- `StatusMultiPick.jsx`：对齐行布局；传入年月；展示已休息列。
- `DayPanel.jsx`：向 `StatusMultiPick` 传入 `monthYear` / `month`。
- `global.css`：更新 `.name-field__colhead` / `.name-field__option` grid；新增 `.badge--on-duty` 等；调整 `.status-multi-pick__option` 为 grid/flex 混合布局。

## 9. 验收

### 9.1 自动化

- 后端：带年月返回 `month_rest_days`；只数 `rest`；leave/on_duty/support/其它月不计；无记录为 `0`；不带年月字段为 null。
- 前端：`cd frontend && npm run build` 通过。

### 9.2 手动

1. 日历页打开姓名下拉：状态与姓名同行、四色可辨、已休息列正确。
2. 打开休息/请假弹层：同上（无当月已排列）。
3. 登记 rest 后刷新：对应人员已休息 +1；leave 不变。
4. 占用人员不可选，键盘导航正常。

## 10. 方案回顾（未选）

- **方案 2**：状态单独成列 — 窄下拉姓名易被截断。
- **方案 3**：整行染色 — 禁用态叠加显脏，区分度不足。

---

**下一步：** 用户审阅本 spec → 通过后 invoke `writing-plans` 生成实现计划。
