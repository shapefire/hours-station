# 三薪日（triple-pay-days）设计文档

> `<name>`: `2026-09-01-triple-pay-days`
> 状态: Phase 0 审批通过
> 关联澄清: `docs/superpowers/clarifications/2026-09-01-triple-pay-days.md`

## 概述

人事 Excel 月度导出表（`hours_export.xlsx`）右侧有「三薪」列（AM 列，每人一格），模板原本用 COUNTIF 公式统计。当前导出逻辑 `_clear_triple_pay_stat` 将其**主动清空**。

本功能新增「三薪日」概念：

1. 在「工作日历」右侧日明细面板（`DayPanel`）可把当前选中日期设为「三薪日」，默认非三薪日。
2. 导出时「三薪」列 = 当月各三薪日的「当天有效工时（含加班）」之和 × 2。

三薪日**仅影响导出「三薪」列**，不改变现有月历合计 / 统计看板 / 总工时 / 核审口径。

## 架构与组件

### 后端（新增 / 改动）

| 文件 | 改动 |
|---|---|
| `app/models.py` | 新增 `TriplePayDay`（`id` 主键 + `work_date` 唯一索引 + `created_at`） |
| `alembic/versions/012_triple_pay_days.py` | 建表 migration |
| `app/schemas.py` | `TriplePayDayPut` / `TriplePayDayOut`；`CalendarMonthOut` 增 `triple_pay_dates` |
| `app/services/triple_pay_days.py`（新增） | 设置/取消、按月查询、区间批量查询 |
| `app/routers/triple_pay_days.py`（新增） | `PUT /api/triple-pay-days/{work_date}` |
| `app/routers/calendar.py` | 响应并入当月三薪日列表 |
| `app/main.py` | 注册 `triple_pay_days` router |
| `app/services/hr_excel_export.py` | `_clear_triple_pay_stat` → `_write_triple_pay`，按三薪日写值 |

### 前端（新增 / 改动）

| 文件 | 改动 |
|---|---|
| `frontend/src/pages/CalendarPage.jsx` | 维护 `triplePayDates`（Set）；`handleToggleTriplePay` |
| `frontend/src/components/DayPanel.jsx` | header 增「三薪日」开关 |
| `frontend/src/components/MonthCalendar.jsx` | 增 `triplePayDates` prop，三薪日格渲染徽标 |
| `frontend/src/styles/global.css` | 三薪徽标 + 开关样式 |

## 数据模型

```python
class TriplePayDay(Base):
    __tablename__ = "triple_pay_days"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

一行 = 一个三薪日；取消三薪日即删除该行（与 `DayNote` 的空内容即删除语义一致）。

## 数据流

```
设置：  DayPanel 开关 → PUT /api/triple-pay-days/{date} {is_triple_pay}
        → 服务 upsert/delete → 前端 refreshCalendar（刷新徽标 + 面板状态）
展示：  GET /api/calendar?year&month → CalendarMonthOut.triple_pay_dates
        → 月历徽标 + 右侧面板选中日状态
导出：  build_export_workbook 查当月三薪日集合
        → 每人 Σ(三薪日当天有效工时 × 2) → 写 AM 列值槽
```

## 接口

### `PUT /api/triple-pay-days/{work_date}`

- body：`{ "is_triple_pay": bool }`
- `true` → upsert 该日期；`false` → 删除记录（幂等，无记录也返回 false）
- 响应：`{ "work_date": "...", "is_triple_pay": bool }`

### `GET /api/calendar`（扩展）

`CalendarMonthOut` 新增字段：

```python
triple_pay_dates: list[date]  # 当月三薪日，升序
```

## 三薪值计算口径（关键）

对每人：

```
三薪值 = Σ( 当月三薪日 entry 的 entry_hours_decimal(entry) × 2 )
```

- `entry_hours_decimal` = 主时段有效工时 + 加班段有效工时（均含「满点扣减」），与右侧面板 / 统计看板同一口径。
- **跳过 `status == "support"`**（支援不计本店工时）。
- rest / leave 无加班段时 `entry_hours_decimal` 为 0，自然不计。
- 结果 `0.1h` 量化后写**数值**（非公式）。
- 写入位置与支援列一致：第 1 位写 off 行（AM4，避免覆盖 AM3 表头文字），其余写各自 on 行（AM 列）。
- 无人三薪日 / 无符合条件工时 → 该员工 AM 格留空（与现状一致）。

> 注意：此口径与导出「总工时」列（`SUM(off)-SUM(on)`，其加班段未套扣减）在**加班段**上有细微差异；三薪严格按「有效工时」口径，与右侧面板一致。

## 错误处理

| 场景 | 行为 |
|---|---|
| `is_triple_pay=false` 且无记录 | 幂等，返回 `is_triple_pay=false` |
| 日期非法 / 越界 | FastAPI 422 |
| 三薪日无任何符合条件工时 | 该员工 AM 格留空，不报错 |
| 时间/扣减异常（end ≤ start） | 沿用 `effective_hours` 抛错 → 400，不产生脏数据 |

## 测试策略

- 新增 `backend/tests/test_triple_pay_days.py`：设置 / 取消 / 幂等取消 / 按月查询 / calendar 响应含 `triple_pay_dates`。
- 扩展 `backend/tests/test_hr_excel_export.py`：
  - 到岗 + 三薪日 → AM 格 = 有效工时 × 2
  - 多三薪日 → 求和
  - 支援当天 → 不计入
  - 休息 + 加班段 → 仅加班段计入
  - 无三薪日 → AM 格留空
  - 超出 15 人槽位的员工 → 同口径写入 AM 列

## 排除范围（non-goals）

- 不改现有总工时 / 月历合计 / 统计看板 / 核审口径
- 不支持文本导入标记三薪日
- 不支持按员工单独设置三薪日（全店日期级）
- 复制当天 / 复制单人不复制三薪日标记
- 不引入权限 / 多店模型
