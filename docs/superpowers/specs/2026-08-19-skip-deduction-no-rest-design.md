# 到岗「未休息」跳过工时扣减

日期：2026-08-19  
状态：已确认  
范围：到岗新增/编辑增加「未休息」勾选；勾选后主时段与加班段均不套用满点扣减；备注自动拼接「未休息不扣减」  
相关代码：`backend/app/models.py`、`backend/app/services/hours.py`、`backend/app/services/entries.py`、`frontend/src/components/EntryForm.jsx`、`HoursBreakdown.jsx`、`frontend/src/utils/hours.js`

---

## 1. 背景

门店扣减规则是「毛工时达到阈值则扣一段休息」（例如满 7 减 0.5、满 7 减 1）。有人当天未休息时，应按毛时长计工时，不能再扣。管理者需要在到岗表单上一键标记，工时与备注同时正确。

## 2. 目标

1. 到岗新增/编辑在「外援」「试工」后增加勾选 **未休息**。
2. 勾选后该条到岗的**主时段和加班段都不扣减**（毛时长即为有效工时）。
3. 保存时备注自动带上 **未休息不扣减**（已有则不重复）；取消勾选则去掉该短语。
4. 复制单人 / 快速复制 / 复制整日保留该标记与备注。

## 3. 非目标

- 改设置里的扣减档本身
- 文本导入自动识别「未休息」（导入仍按现规则扣减，除非以后另做）
- 休息 / 请假 / 支援记录上的「未休息」勾选
- 深色模式或新统计口径

## 4. 已确认决策

| 项 | 选择 |
|----|------|
| 架构 | 方案 A：`work_entries` 布尔字段，工时引擎按标记跳过扣减 |
| 加班段 | 与主时段一并跳过扣减 |
| 备注 | 系统拼接/移除固定短语「未休息不扣减」，顿号分隔 |
| 导入 | 本期不解析该标记 |
| 展示 | 列表不另做徽章；点进编辑可见勾选；预览文案走已有备注 |

## 5. 数据模型

新增列：

- `work_entries.skip_deduction: BOOLEAN NOT NULL DEFAULT false`

服务层约束：

- `status != on_duty` 时强制 `skip_deduction = false`（与 `is_external` / `is_trial` 相同）。
- 仅 `on_duty` 可为 `true`。

Alembic 迁移：加列 + `server_default=false`。已有行均为 `false`。

## 6. 工时计算

现有：

```
hours(entry) = effective_hours(主段) + effective_hours(加班段)
effective_hours(start, end) = round1(raw - deduct_if_threshold)
```

本期：

```
hours(entry) =
  segment_hours(主段, skip) + segment_hours(加班段, skip)
```

`skip = entry.skip_deduction`：

- `false`：每段仍走现有 `effective_hours`
- `true`：每段 `round1(raw)`，扣减视为 0（满 7 减 0.5 → 不减 0.5；满 7 减 1 → 不减 1）

日历合计、员工月合计、统计看板到岗工时均走 `format_entry_hours`，无需另写口径。

前端 `HoursBreakdown` / `computeHoursBreakdown`：勾选未休息时展示扣减 0、有效 = 毛时长。

## 7. 备注拼接

固定短语：`未休息不扣减`（与预设备注一样用顿号 `、`）。

| 操作 | 备注结果 |
|------|----------|
| 勾选且备注不含该短语 | 空备注 → `未休息不扣减`；已有 `制备位` → `制备位、未休息不扣减` |
| 勾选且已含该短语 | 不重复追加 |
| 取消勾选 | 去掉该短语及多余顿号（`制备位、未休息不扣减` → `制备位`） |

拼接在**保存时**由前端提交最终 `note` + `skip_deduction`；后端以字段为准算工时，备注按提交文本存储（后端可再规范化短语，避免只改备注、未改勾选的不一致——**以后端字段为准算工时；备注规范化可在服务层与前端各做一次，以后端保存结果为准**）。

推荐：服务层在 `on_duty` 写入时按 `skip_deduction` 规范化 `note`，保证导入以外的 API 调用也一致。

## 8. API

- Create / PATCH / copy / copy-day：读写 `skip_deduction`（默认 false）。
- List / get 条目：返回该字段。
- 排班导入 commit：本期不传或固定 `false`（解析不设该标记）。

## 9. 前端

- `EntryForm`：外援、试工后增加「未休息」checkbox；勾选变化时即时改备注并刷新工时明细。
- 快速复制行：带上源记录的 `skip_deduction` 与备注。
- 支援表单不加此项。

## 10. 验收

- 满 7 减 0.5：7.5 毛时长到岗，不勾选 → 7.0h；勾选 → 7.5h，备注含「未休息不扣减」。
- 满 7 减 1：同样毛时长，勾选后不减 1。
- 主段 + 加班段均达阈值时，勾选后两段都不扣。
- 改为休息后标记被清掉，工时按休息规则。
- 取消勾选后恢复扣减，备注去掉该短语。
- 复制到岗保留标记。

## 11. 已否决

| 方案 | 原因 |
|------|------|
| 只靠备注关键字判断 | 改备注易漏算 |
| 主/加班分开关 | 已选整条到岗统一不扣 |
