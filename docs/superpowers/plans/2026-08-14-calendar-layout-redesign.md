# 工作日历布局调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将工作日历页改为左日历（略收窄）+ 右安排区；安排区共用标题栏，内容两列（到岗更宽 | 休息/请假/支援略窄），「新增到岗」归属到岗列。

**Architecture:** 仅前端布局重组。`CalendarPage` 数据流不变；`DayPanel` 把 header 跨列动作与到岗主按钮拆开，body 用 `day-panel__columns` 网格包两列；`global.css` 调整页面栏宽比、列比例与 ≤1100px 单列堆叠。

**Tech Stack:** React 19 + Vite 8；CSS（现有 tokens）；无前端单测 → 以 `npm run build` + 手动验收为准。

**Spec:** `docs/superpowers/specs/2026-08-14-calendar-layout-redesign.md`

## Global Constraints

- 不改后端 API、状态语义、工时口径、统计看板
- 沿用现有视觉 tokens（`--accent` / `--rest`、Source Serif / DM Sans），不换肤
- 共用标题栏：预览 / 复制到… / 清空当日；**不含**「新增到岗」
- 「新增到岗」仅在到岗列头；表单/草稿/到岗列表仅在到岗列
- 休息 → 请假 → 支援 同在状态列纵向排列
- 整块安排区共用滚动；不做左右独立滚动
- 宽屏：页面 `日历 ~1fr | 安排 ~1.55–1.7fr`；安排内 `到岗 ~1.35 | 状态 ~1`
- `≤1100px`：上日历下安排；安排内两列改为单列（先到岗后状态）
- 提交说明使用中文简述；未获用户明确要求时执行阶段可不 commit（以用户指令为准）

## File Structure

```
frontend/
  src/components/DayPanel.jsx   # header 去「新增到岗」；body 两列结构
  src/styles/global.css         # workspace 比例、columns 网格、窄屏堆叠、列头样式
```

`CalendarPage.jsx` 预计无需改动（仍渲染 `<DayPanel … />`）。

---

### Task 1: CSS — 页面比例与安排区两列骨架

**Files:**
- Modify: `frontend/src/styles/global.css`（`.calendar-page__workspace`、`.day-panel*`、`@media (max-width: 1100px)`）

**Interfaces:**
- Produces: 类名约定供 Task 2 使用：
  - `.day-panel__columns` — 内容两列网格容器
  - `.day-panel__col` / `.day-panel__col--duty` / `.day-panel__col--status` — 列包裹
  - `.day-panel__section-head` 已有；到岗列头上的主按钮沿用 `.btn.btn--primary`

- [ ] **Step 1: 调整页面栏宽比**

在 `frontend/src/styles/global.css` 将：

```css
.calendar-page__workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 1.25rem;
}
```

改为：

```css
.calendar-page__workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.65fr);
  gap: 1.25rem;
}
```

- [ ] **Step 2: 增加安排区两列布局样式**

在 `.day-panel__body` 规则之后（约 `day-panel__status` 之前）插入：

```css
.day-panel__columns {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 0 1rem;
  align-items: start;
  min-width: 0;
}

.day-panel__col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.day-panel__col--duty {
  padding-right: 1rem;
  border-right: 1px solid color-mix(in srgb, var(--accent) 14%, transparent);
}

.day-panel__col--status {
  gap: 0.85rem;
}

.day-panel__col--status .day-panel__section {
  gap: 0.4rem;
}
```

保持 `.day-panel__body` 仍为：

```css
.day-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
```

（loading / 全日空态可仍在 `columns` 外、body 顶部。）

- [ ] **Step 3: 窄屏改为单列堆叠**

在现有 `@media (max-width: 1100px)` 块内（已有 `.calendar-page__workspace { grid-template-columns: 1fr; }` 附近）追加：

```css
  .day-panel__columns {
    grid-template-columns: 1fr;
    gap: 0.85rem;
  }

  .day-panel__col--duty {
    padding-right: 0;
    border-right: none;
    padding-bottom: 0.85rem;
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 12%, transparent);
  }
```

- [ ] **Step 4: 构建冒烟（类名尚未挂载也可通过）**

Run:

```bash
cd frontend && npm run build
```

Expected: build 成功（vite 产出 dist）。

- [ ] **Step 5: Commit（仅当用户要求提交时）**

```bash
git add frontend/src/styles/global.css
git commit -m "为工作日历安排区预留两列布局样式并收窄月历栏宽。"
```

---

### Task 2: DayPanel — 结构重组与按钮落点

**Files:**
- Modify: `frontend/src/components/DayPanel.jsx`（`return` 内 header + body；约 L310–590）

**Interfaces:**
- Consumes: Task 1 的 `.day-panel__columns` / `__col--duty` / `__col--status`
- Produces: DOM 结构符合 spec；props / handlers 签名不变（`onAdd`、`onCopyDay`、`onClearDay` 等）

- [ ] **Step 1: 共用标题栏去掉「新增到岗」**

在 `DayPanel` 的 `header.day-panel__header-actions` 中**删除**「新增到岗」按钮整块（保留预览 / 复制到… / 清空当日）。删除的是类似：

```jsx
<button
  type="button"
  className="btn btn--primary"
  onClick={onAdd}
  disabled={
    !selectedDate ||
    formMode === 'create' ||
    Boolean(draftCopy || pasteMode || addingSupport || supportBusy || statusSyncBusy)
  }
>
  新增到岗
</button>
```

- [ ] **Step 2: body 改为两列包裹**

将 `day-panel__body` 内「到岗 section + 休息/请假 StatusChipSection + 支援 section」替换为下列结构（loading / emptyDay 保留在 columns 之前；逻辑与列表内容从现有代码原样迁入，勿改 handler）：

```jsx
<div className="day-panel__body" ref={bodyRef}>
  {loading ? <p className="day-panel__status">加载中…</p> : null}

  {emptyDay ? (
    <p className="day-panel__status">当日暂无登记，点击「新增到岗」开始录入。</p>
  ) : null}

  <div className="day-panel__columns">
    <div className="day-panel__col day-panel__col--duty">
      <section className="day-panel__section">
        <div className="day-panel__section-head">
          <h3 className="day-panel__section-title">
            到岗安排
            <span className="day-panel__section-count">{dutyCount}</span>
          </h3>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onAdd}
            disabled={
              !selectedDate ||
              formMode === 'create' ||
              Boolean(draftCopy || pasteMode || addingSupport || supportBusy || statusSyncBusy)
            }
          >
            新增到岗
          </button>
        </div>

        {formMode === 'create' ? (
          <div className="day-panel__create">
            <h3 className="day-panel__create-title">新增到岗</h3>
            <EntryForm
              mode="create"
              onSubmit={onFormSubmit}
              onCancel={onFormCancel}
              busy={formBusy}
              error={formError}
              monthYear={monthYear}
              month={month}
            />
          </div>
        ) : null}

        <ul className="day-panel__list">
          {/* 现有 DraftCopyRow + duty.map 原样保留 */}
        </ul>

        {!loading && duty.length === 0 && formMode !== 'create' && !draftCopy ? (
          <p className="day-panel__section-empty">暂无到岗安排</p>
        ) : null}
      </section>
    </div>

    <div className="day-panel__col day-panel__col--status">
      <StatusChipSection
        title="休息人员"
        entries={rest}
        actionsLocked={actionsLocked}
        onAdd={() => openMultiPick('rest')}
        onRemove={(entry) => onRemoveEntry?.(entry)}
      />

      <StatusChipSection
        title="请假人员"
        entries={leave}
        actionsLocked={actionsLocked}
        onAdd={() => openMultiPick('leave')}
        onRemove={(entry) => onRemoveEntry?.(entry)}
      />

      <section className="day-panel__section">
        {/* 现有支援 section 头/表单/列表/空态原样保留 */}
      </section>
    </div>
  </div>
</div>
```

注意：

- 原先 body 顶层的「新增到岗」`day-panel__create` 块移入到岗列（列头按钮下方）
- `DraftCopyRow` 与 `duty.map`、支援整段 JSX **只搬位置，不改业务逻辑**
- `DayPreviewModal` / `StatusMultiPick` 仍挂在 `section.day-panel` 根下、body 外

- [ ] **Step 3: 构建验证**

Run:

```bash
cd frontend && npm run build
```

Expected: build 成功，无 JSX/语法错误。

- [ ] **Step 4: 手动结构核对（开发服务器或构建预览）**

Run（可选）:

```bash
cd frontend && npm run dev
```

核对：

1. 宽屏：左日历较窄，右安排较宽
2. 标题栏有预览/复制/清空，**没有**「新增到岗」
3. 「新增到岗」在到岗列头；点击后表单出现在到岗列
4. 右侧为休息 → 请假 → 支援
5. 到岗列视觉上宽于状态列

- [ ] **Step 5: Commit（仅当用户要求提交时）**

```bash
git add frontend/src/components/DayPanel.jsx
git commit -m "重组日明细为到岗与状态两列，并将新增到岗移入到岗列。"
```

---

### Task 3: 视觉微调与验收

**Files:**
- Modify: `frontend/src/styles/global.css`（仅在手测发现间距/分割线别扭时做最小调整）
- Modify: `frontend/src/components/DayPanel.jsx`（仅在空态文案位置需要时微调；默认可不改）

**Interfaces:**
- Consumes: Task 1–2 已挂载结构
- Produces: 满足 spec 验收标准 1–6

- [ ] **Step 1: 宽屏观感微调（按需）**

若手测觉得挤或空：

- 列间距：调整 `.day-panel__columns` 的 `gap` / `.day-panel__col--duty` 的 `padding-right`
- 状态列块距：调整 `.day-panel__col--status` 的 `gap`（spec 约 `0.85–1rem`）
- 分割线过重：降低 `border-right` 的 `color-mix` 透明度
- **不要**给两列再套额外卡片背景

- [ ] **Step 2: 窄屏验收**

将视口缩到 ≤1100px，确认：

1. 上日历、下安排
2. 安排内先到岗后状态（单列）
3. 到岗列底部分割线出现，右侧竖线消失

- [ ] **Step 3: 功能回归抽查**

在同一日依次确认无回归：

- 新增/编辑/删除到岗；快速复制草稿
- 休息/请假多选添加与 chip 移除
- 支援新增/编辑/删除
- 预览、复制到…、清空当日
- 有表单/草稿/粘贴/状态同步时，相关按钮仍正确 disabled

- [ ] **Step 4: 最终构建**

Run:

```bash
cd frontend && npm run build
```

Expected: pass。

- [ ] **Step 5: Commit（仅当用户要求提交时）**

```bash
git add frontend/src/styles/global.css frontend/src/components/DayPanel.jsx
git commit -m "微调工作日历两列间距与窄屏分隔，完成布局验收。"
```

若 Task 3 无文件改动则跳过 commit。

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| 页面日历收窄、安排变宽 | Task 1 Step 1 |
| 安排区共用标题栏（预览/复制/清空） | Task 2 Step 1 |
| 新增到岗在到岗列 | Task 2 Step 2 |
| 到岗 \| 状态两列比例 | Task 1 Step 2 + Task 2 Step 2 |
| 状态列休息→请假→支援 | Task 2 Step 2 |
| 同面板细分割线、不硬卡片 | Task 1 Step 2 + Task 3 |
| 共用滚动 | Task 1（沿用 `day-panel__body` overflow） |
| ≤1100px 单列堆叠 | Task 1 Step 3 + Task 3 Step 2 |
| 不改 API/统计 | 全任务仅前端布局 |

## Plan Self-Review

- 无 TBD/TODO；类名与步骤代码一致
- 前端无单测框架，验证路径与既有计划一致（`npm run build` + 手测）
- `CalendarPage.jsx` 明确预计不改，避免范围蔓延
