# 支援时段改为非必填

日期：2026-08-25  
状态：已确认（brainstorming）  
范围：新增、编辑、文本导入中「支援」主时段变为可选；统计与 Excel 导出口径对齐  
相关代码：`backend/app/services/entries.py`、`backend/app/services/roster_text_import.py`、`frontend/src/components/SupportForm.jsx`、`frontend/src/components/RosterTextImportModal.jsx`

---

## 1. 背景

此前支援与到岗一样强制填写开始/结束时间。实际登记时常只需标记「当天支援出去」，时段未知或不需要计入工时。Excel 导出已不再写入支援每日格与支援列；统计仍按记录计支援天数、按时段累加支援工时。

## 2. 目标

1. **新增 / 编辑 / 导入**：支援主时段非必填。
2. **成对约束**：只填开始或只填结束 → 拒绝。
3. **统计**：有支援记录则支援天数计 1；无时段时支援工时为 `0.0`。
4. 三入口校验口径一致。

## 3. 非目标

- 不改到岗（仍强制时段）
- 不改休息/请假（仍禁止主时段；加班段规则不变）
- 不改 Excel 导出（支援本就不写格）
- 不新增「无工时支援」独立状态

## 4. 已确认决策

| 项 | 选择 |
|----|------|
| 无时段时统计 | 支援天数仍计；支援工时 `0.0` |
| 只填一半 | 拒绝，提示时段须成对填写 |
| 实现方式 | 方案 A：放宽后端/导入校验 + 前端表单可选 |

## 5. 规则明细

| 开始 | 结束 | 结果 |
|------|------|------|
| 空 | 空 | 允许；存 `null`；工时 0 |
| 有 | 有，且 `end > start` | 允许；按现有规则算有效工时 |
| 有 | 有，且 `end <= start` | 拒绝（无效时段） |
| 有 | 空 | 拒绝：「时段须成对填写」 |
| 空 | 有 | 拒绝：「时段须成对填写」 |

加班（`ot_start` / `ot_end`）规则不变：成对或全空；与主时段是否填写独立。

## 6. 实现要点

### 6.1 后端 `entries._normalize_entry_fields`

`status == "support"`：

- `start is None and end is None` → 返回空时段，`skip_deduction=False`，禁止外援/试工
- 仅一方非空 → `ValueError("时段须成对填写")`
- 双方非空 → 现有 `format_effective_hours` 校验后保留

### 6.2 文本导入 `roster_text_import._validate_draft`

- 删除 `missing_support_times` 判定
- 支援缺一边仍可由「一边有一边无」走成对失败；两边都有但 `end <= start` 继续用 `invalid_time_range`
- 建议：一边有一边无时追加 `incomplete_time_pair`（或复用文案一致的错误码），预览与提交均拦截

### 6.3 前端

- `SupportForm`：去掉时段 `required`；新建默认 `start_time`/`end_time` 为空串；提交时空 → `null`；只填一半本地拦截
- `RosterTextImportModal`：去掉 `missing_support_times` 文案与本地同类校验；与后端错误码对齐

### 6.4 统计

无需改 `stats.py`：`support_days` 按记录数；`entry_hours_decimal` 无时段为 0。

## 7. 验收

- pytest：支援无时段可 create/patch；只填一半 400；导入无时段可预览与提交；导入只填一半失败
- 前端：支援表单可不填时段保存；只填一边有提示
- 统计看板：无时段支援显示天数 +1、工时 0.0

## 8. 方案回顾（未选）

- 仅后端放宽、UI 仍默认时段：易误带默认时间
- 拆「有工时/无工时」双状态：过重
