# 花名册短名编辑与人员合并

日期：2026-08-20  
状态：已确认（brainstorming）  
范围：设置花名册支持短名编辑；撞名时合并两人；同日冲突逐条选择；导出姓名/岗位在合并时由用户选择  
相关代码：`backend/app/models.py`、`backend/app/services/employees.py`、`backend/app/routers/employees.py`、`frontend/src/components/RosterSettingsPanel.jsx`、`frontend/src/settings/events.js`

---

## 1. 背景

花名册目前可维护岗位、导出姓名、排序，但**短名（`employees.name`）只读**。实际使用中会出现：

- 录入时姓名写错，需要在设置里改正；
- 发现两人实为同一人（或应合并为一人），改名后与已有短名冲突；
- 导出姓名无唯一约束，可能与他人的短名或导出姓名重复，Excel 导出时混淆。

排班数据通过 `work_entries.employee_id` 关联人员，**不是**存姓名字符串。因此单纯改名只需更新 `employees.name`；合并则是把 source 的 entry 迁移到 target 并软删 source。

## 2. 目标

1. 花名册列表中**短名可编辑**（与岗位、导出姓名相同的行内输入 + blur/Enter 保存）。
2. 保存时若新短名与**其他活跃人员**相同 → 提示是否合并；用户确认后进入合并流程。
3. 合并前预览**同日冲突**；每个冲突日期用户**逐条选择**保留 source 或 target 的记录（方案 C）。
4. 合并时若两人的**导出姓名**或**岗位**均有值且不同 → 在合并弹窗中让用户选择保留哪套（方案 C）。
5. **导出姓名重复**时显示黄色 inline 警告，不阻断保存。

## 3. 非目标

- 别名表 / 多人共用短名（短名仍 UNIQUE）
- 独立「合并」入口（不从改名触发）
- 硬删除员工或历史排班
- 合并已软删（inactive）人员
- 导入排班文本的匹配逻辑改造

## 4. 已确认决策

| 项 | 选择 |
|---|---|
| 短名冲突 | 提示合并；不合并则取消改名（DB UNIQUE 不允许重复短名） |
| 同日冲突 | 列出冲突日期，用户逐条选保留 source 或 target |
| 导出姓名/岗位冲突 | 合并弹窗中用户选择保留哪套 |
| 排班「改名」 | 仅更新 `employees.name`；entry 无需改字符串 |
| 导出姓名重复 | UI 警告，不阻断 |
| 合并方向 | 改名者 = source，已存在同名者 = target |

## 5. 数据与语义

### 5.1 不变部分

- `employees.name`：UNIQUE，日常登记、下拉、日历展示用（短名）
- `employees.export_name`：可选，仅 HR Excel 导出；无 UNIQUE
- `work_entries.employee_id`：排班与人员的唯一关联

### 5.2 改名（无冲突）

`PATCH /api/employees/{id}` 扩展 `{ name?: string }`：

- trim；1–64 字；与当前值相同则 no-op
- 与其他**活跃**人员短名相同 → **409** `name_exists`（不自动合并，由前端弹窗）
- 成功 → 200 `EmployeeOut`；历史 entry 自动显示新短名（join）

### 5.3 合并

**source**：正在改名的那个人（如「李四」）  
**target**：已拥有目标短名的人（如「张三」）

执行后：

1. 无冲突日期的 source entries → `employee_id = target.id`
2. 冲突日期 → 保留用户所选 entry，**删除**另一条
3. 按用户选择写入 target 的 `export_name`、`position`
4. `source.is_active = false`

## 6. API

### 6.1 `PATCH /api/employees/{id}`

请求体扩展：

```json
{ "name": "新短名", "export_name": "...", "position": "..." }
```

| 状态 | 说明 |
|------|------|
| 200 | 更新成功 |
| 400 | 空名、超长、员工不存在 |
| 409 | `{ "code": "name_exists", "existing_id": "uuid", "existing_name": "张三" }` |

### 6.2 `GET /api/employees/merge-preview`

Query：`source_id`、`target_id`（均为活跃员工 UUID）

Response：

```json
{
  "source_name": "李四",
  "target_name": "张三",
  "source_export_name": "李四全名",
  "target_export_name": "张三全名",
  "source_position": "收银",
  "target_position": "理货",
  "movable_count": 12,
  "conflicts": [
    {
      "work_date": "2026-08-05",
      "source_entry": {
        "id": "uuid",
        "status": "on_duty",
        "start_time": "09:00",
        "end_time": "18:00",
        "ot_start_time": null,
        "ot_end_time": null,
        "is_external": false,
        "is_trial": false,
        "skip_deduction": false,
        "note": null
      },
      "target_entry": {
        "id": "uuid",
        "status": "rest",
        "start_time": null,
        "end_time": null,
        "ot_start_time": null,
        "ot_end_time": null,
        "is_external": false,
        "is_trial": false,
        "skip_deduction": false,
        "note": "调休"
      }
    }
  ]
}
```

- `conflicts` 按 `work_date` 升序
- `movable_count`：source 中不与 target 同日冲突、可直接迁移的 entry 数
- 若 source/target 非活跃或不存在 → 400

### 6.3 `POST /api/employees/merge`

请求：

```json
{
  "source_id": "uuid",
  "target_id": "uuid",
  "resolutions": [
    { "work_date": "2026-08-05", "keep": "source" },
    { "work_date": "2026-08-12", "keep": "target" }
  ],
  "export_name_keep": "target",
  "position_keep": "source"
}
```

- `resolutions`：必须覆盖 preview 中**全部**冲突日期；`keep` 为 `"source"` | `"target"`
- `export_name_keep` / `position_keep`：`"source"` | `"target"` | `"empty"`
  - 若一方为空、另一方有值：preview 中仍返回两者；UI 可默认选有值的一方，用户可改
  - 若两者均为空：传 `"empty"` 或省略（结果 target 字段为 null）
  - 若仅一方有值：UI 默认该方；用户仍可通过 `"empty"` 选清空

Response 200：

```json
{
  "merged_entries": 12,
  "discarded_entries": 2,
  "target": { /* EmployeeOut */ }
}
```

| 状态 | 说明 |
|------|------|
| 400 | resolution 缺失/多余、非法 keep、source=target |
| 404 | 员工不存在 |
| 409 | source 已 inactive |

## 7. 界面规格

### 7.1 短名编辑

- 花名册每行：短名由 `<span>` 改为 `<input>`，样式与岗位/导出姓名列一致
- blur 或 Enter → 尝试 PATCH
- 成功 → 本地更新 + `notifyRosterChanged()`
- 409 → 打开 **合并确认弹窗**（短名 input 保留用户输入，取消后恢复服务端值）

### 7.2 合并确认弹窗（RenameConflictModal）

```
「张三」已在花名册中。

是否将「李四」合并到「张三」？
· 李四的历史排班归入张三
· 李四从花名册移除（历史保留）

        [ 取消 ]    [ 继续合并 ]
```

- **取消**：关闭弹窗，短名恢复为「李四」
- **继续合并**：`GET merge-preview` → 打开冲突解决弹窗

### 7.3 冲突解决弹窗（MergeConflictModal）

**A. 导出姓名 / 岗位（若 preview 显示两者至少一方有值且不完全相同）**

```
导出姓名    ○ 李四全名    ○ 张三全名    ○ 留空
岗位        ○ 收银        ○ 理货        ○ 留空
```

- 两者相同则隐藏该行
- 仅一方有值：默认选有值方，仍显示三选项（含留空）

**B. 同日冲突表格**

| 日期 | 李四 | 张三 | 保留 |
|------|------|------|------|
| 8/5（二） | 在岗 9:00–18:00 | 休息 | ○李四 ○张三 |

每条 entry 摘要：状态、时段、加班段、外店/试工/免扣标签、备注（截断）

- 无冲突时仅显示 A（若有）+ 摘要「将迁移 12 条排班」
- 「确认合并」：所有冲突行已选 + export/position 已选（若展示）才可点
- 提交 `POST merge` → 成功关闭弹窗、reload 花名册、`notifyRosterChanged()`

### 7.4 导出姓名重复警告

保存 `export_name`（blur PATCH）后，若与列表中**其他**活跃人员的 `name` 或 `export_name`（非空）相同：

- 该行下方黄色小字：`导出姓名与「王五」相同，Excel 导出时可能混淆`
- 不阻止 PATCH

前端用当前 roster 列表本地计算即可，无需新 API。

## 8. 边界行为

| 场景 | 行为 |
|------|------|
| 改名为自身 trim 后相同 | 不请求 |
| 改名的目标名是 inactive 员工 | 409 仍走合并流程；preview 若 target 必须 active，则 409 时仅允许合并到**活跃**同名者（inactive 同名由 import 复活逻辑处理，改名不自动复活） |
| 合并后 source 有 0 条 entry | 仍软删 source，更新 export/position |
| 冲突日 keep source | 该 entry 的 `employee_id` 改为 target |
| 冲突日 keep target | 删除 source 侧 entry |
| 合并进行中用户关弹窗 | 等同取消，不执行 merge |
| 改名 PATCH 与 merge 之间 source 被删 | merge 409 |

**inactive 同名说明**：`employees.name` UNIQUE 含 inactive 行。若存在 inactive「张三」，活跃「李四」不能 PATCH 为「张三」而不处理 inactive 行。实现时 409 的 `existing_id` 指向冲突行；若其为 inactive，合并确认文案改为「将复活并合并到已移出的「张三」」或要求先处理 inactive——**本 spec 简化：409 仅针对活跃同名；若 DB 仅有 inactive 同名，PATCH name 会触发 IntegrityError，服务层转为「请先导入复活或联系管理员」类 400**。（实现时 `rename_employee` 查重仅 `is_active=true`。）

## 9. 实现要点

### 后端

- `employees.py`：`rename_employee`、`merge_preview`、`merge_employees`
- `schemas.py`：`EmployeeUpdate.name`、`MergePreviewOut`、`MergeIn`、`MergeOut`
- `routers/employees.py`：PATCH 扩展、GET preview、POST merge
- 测试：改名成功/409；preview 冲突列表；merge 迁移与丢弃；export/position 选择；`(work_date, employee_id)` 唯一性

### 前端

- `RosterSettingsPanel.jsx`：短名 input、两个 modal、export_name 警告
- 可选抽 `RenameConflictModal.jsx`、`MergeConflictModal.jsx`
- 样式沿用 `.settings-modal__*`、`.roster-row__field`

## 10. 验收

- pytest：rename、merge-preview、merge 全路径；冲突 resolution；inactive 边界
- `cd frontend && npm run build`
- 手动：改名无冲突；撞名→合并→选冲突→花名册少一人、日历 entry 归属正确；导出姓名重复出现警告

## 11. 方案回顾（未选）

| 方案 | 未选原因 |
|------|----------|
| 别名表 | 小店场景过重 |
| 同日冲突自动保留 target | 可能丢数据，用户选 C |
| 导出/岗位自动保留 target | 用户选 C，合并弹窗内选择 |
| 允许重复短名 | 与 UNIQUE 及登记逻辑冲突 |
