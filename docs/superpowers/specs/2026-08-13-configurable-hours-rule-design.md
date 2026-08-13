# 可配置工时计算规则 — 设计说明

日期：2026-08-13  
状态：已确认

## 背景

当前工时规则写死在前后端：毛工时 ≥ 6 小时则扣 0.5 小时。需要在设置页可配置，并让存储结构便于日后扩展为阶梯规则。

## 目标

- 设置页可配置「满 X 小时 / 扣 Y 小时」
- 默认 X=6、Y=0.5；`Y=0` 表示不扣减
- 改规则后全局按新规则现算（工时不落库，与现状一致）
- 第一版 UI 只维护一档；数据模型按阶梯表设计，便于扩展

## 非目标

- 多档编辑 UI、常见模板一键套用
- 跨进程 / 多 worker 缓存广播（第一版假设单进程）
- 历史规则快照或按录入时规则冻结

## 数据模型

表名：`hours_rule_tiers`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | |
| `min_hours` | Numeric(4,1) | 毛工时 ≥ 此值时适用 |
| `deduct_hours` | Numeric(4,1) | 扣减小时；`0` = 不扣减 |
| `sort_order` | Integer | 展示顺序 |
| `created_at` | DateTime(tz) | |

约束与语义：

- `0 < min_hours ≤ 24`
- `0 ≤ deduct_hours ≤ min_hours`
- `min_hours` 唯一
- 匹配：按 `min_hours` **降序**，命中第一条即用该档扣减
- 迁移种子一行：`min_hours=6.0, deduct_hours=0.5`
- 表空时计算侧回退默认 `(6.0, 0.5)`，避免全站不可用

## API

挂在 `/api/settings`：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/settings/hours-rule` | 读当前规则（走缓存） |
| `PUT` | `/api/settings/hours-rule` | 整份替换并刷新缓存 |

请求/响应体：

```json
{
  "tiers": [
    { "min_hours": "6.0", "deduct_hours": "0.5" }
  ]
}
```

- 小时数用字符串，与现有 `effective_hours` 展示一致
- 第一版：`tiers` 长度必须为 **1**
- `PUT`：事务内先删后插，便于日后多档；写库成功后再更新缓存
- 校验失败 → `400` + 中文 `detail`；精度最多 1 位小数

## 计算逻辑

`effective_hours(start, end, tiers)`：

1. 计算毛工时 `raw`
2. `tiers` 为空 → 默认 `[(6.0, 0.5)]`
3. 按 `min_hours` 降序匹配第一条 `raw >= min_hours`
4. 命中且 `deduct_hours > 0` → `raw - deduct_hours`；否则 `raw`
5. 量化到 1 位小数（`ROUND_HALF_UP`）

所有调用点（entries / calendar / stats / employees 等）使用同一套带档位的计算；工时继续现算，不落库。

## 缓存

- **启动**：lifespan/startup 从 DB 加载全部档位到进程内缓存；表空则写入默认 `(6.0, 0.5)` 后再载入缓存，保证库与缓存一致
- **读**：`effective_hours`、`GET /api/settings/hours-rule` 等一律读缓存，运行期不查库
- **写**：`PUT` 写库成功后立即覆盖缓存；失败则缓存不变
- **部署假设**：单 worker；多进程时各有独立缓存，需重启或后续加广播（本版不做）

## 前端设置 UI

在 `SettingsModal` 增加分区「工时计算」：

- 输入：满多少小时（`min_hours`）、扣减小时（`deduct_hours`）
- 说明：毛工时达到或超过阈值时扣减；扣减为 0 表示不扣
- 打开分区时 `GET` 填充；保存时 `PUT`
- 保存成功后通过事件总线通知订阅方（同备注预设模式），录入预览刷新

`computeHoursBreakdown` 改为使用当前规则档位，与后端算法一致。

## 测试计划

- 单元：默认 6/0.5、自定义阈值、`deduct=0`、未达阈值、边界 24h
- API：`GET`/`PUT` 往返一致；非法值 400
- 回归：默认规则下 entries/calendar/stats 结果与现网一致
- 缓存：startup 加载后计算用缓存；`PUT` 后同进程立即生效

## 扩展预留

日后阶梯规则：同一表多行 + 同一 API 允许多档；计算已按降序匹配；仅需放开第一版的「长度必须为 1」与设置页多档编辑。
