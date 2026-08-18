# iOS 风格 UI 重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全应用前端视觉与布局改为 iOS/iPadOS 浅色分组列表风格，右侧当日区成为主内容面，功能与 API 行为不变。

**Architecture:** 先替换 `tokens.css` 与全局表面样式（按钮、modal、壳层），再改 AppShell 分段导航；随后日历页（月历 + DayPanel 顶栏一行短按钮 + 取消双栏改为纵向分组列表）；最后统计页与设置/业务 modal 统一表面，删除死 CSS。无后端改动。

**Tech Stack:** React, Vite, 现有 CSS（`tokens.css` + `global.css`），无新 UI 库

**Spec:** `docs/superpowers/specs/2026-08-18-ios-ui-redesign-design.md`  
**视觉参考:** `.superpowers/brainstorm/proto-1787084856.42572/content/ios-app-prototype-v3.html`

## Global Constraints

- 不改 API、工时计算、状态语义、导入解析、预览文案拼接规则
- 功能冻结清单全部保留（日历、当日 CRUD、OT、导入、预览/复制、清空、统计、设置）
- 当日顶栏：标题与 **一行** 短按钮（新增 / 导入 / 预览 / 复制 / 清空）同一行；完整文案放 `title` / `aria-label`
- 取消 `day-panel__columns` 双栏；到岗 → 休息 → 请假 → 支援 纵向分组
- 状态色仅用于行内点缀（到岗绿 / 休息灰 / 请假橙 / 支援蓝）；主 UI 中性灰黑
- 删除确认不再使用的旧布局 CSS / 旧 token
- 前端无单测：每任务以 `npm run build` + 手动清单验收；后端测试不必改
- Commit 步骤：仅在用户明确要求提交时执行；否则改完停在 working tree，由会话统筹提交

## Implementation Decisions（规格 §10）

| 项 | 决定 |
|----|------|
| Modal 形态 | **保持居中 Dialog**（现有 `.modal-backdrop` + `.modal`），全站统一，不做右侧 Drawer |
| 空分组 | **始终显示 section 标题 +「暂无」**（到岗用「暂无到岗安排」；休息/请假/支援用「暂无」；与现有 `StatusSection` 一致） |
| 短按钮文案 | 见下表 |
| 窄屏 | **桌面优先**；日历页 `@media` 可将月历叠到上方；当日顶栏按钮 `nowrap` 不换行到标题下；极窄时允许横向滚动 actions，不做 overflow 菜单 |

### 短按钮文案表

| 界面短标签 | `title` | `aria-label` |
|------------|---------|--------------|
| 新增 | 新增到岗 | 新增到岗 |
| 导入 | 文本导入 | 文本导入 |
| 预览 | 预览 | 预览 |
| 复制 | 复制到… | 复制到其他日期 |
| 清空 | 清空当日 | 清空当日 |

空日提示文案由「点击「新增到岗」」改为「点击「新增」开始录入。」（与短标签一致）。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `frontend/src/styles/tokens.css` | iOS 浅色 token + 迁移期旧名别名 |
| `frontend/src/styles/global.css` | 壳层、按钮、日历、DayPanel、统计、modal 改肤；删死规则 |
| `frontend/src/components/AppShell.jsx` | 顶栏分段感；去掉英文副标题 |
| `frontend/src/components/MonthCalendar.jsx` | 仅必要时 class 微调；逻辑不变 |
| `frontend/src/components/DayPanel.jsx` | 顶栏一行短按钮；取消双栏；分组顺序 |
| `frontend/src/pages/CalendarPage.jsx` | 仅布局 class 跟随时微调 |
| `frontend/src/pages/StatsPage.jsx` | KPI 卡表面 class（字段不变） |
| `frontend/src/components/StatsPeopleTable.jsx` | 表格表面 class |
| `frontend/src/components/SettingsModal.jsx` | 分段导航视觉；逻辑不变 |
| `frontend/src/components/EntryForm.jsx` 等表单/Modal | 仅跟 CSS，逻辑不动 |
| `frontend/index.html` | 去掉 Google Fonts |

---

### Task 1: Design tokens + 全局表面基础

**Files:**
- Modify: `frontend/src/styles/tokens.css`
- Modify: `frontend/src/styles/global.css`（`body`、`.btn*`、基础 `.modal*`）
- Modify: `frontend/index.html`

**Interfaces:**
- Produces: `--bg-app`、`--bg-elevated`、`--label`、`--secondary`、`--tertiary`、`--separator`、`--accent`、`--danger`、`--fill`、`--status-duty|rest|leave|support`、`--radius-group`、`--radius-pill`、`--shadow`、`--font-body`；以及旧名别名（`--bg0`、`--ink`、`--muted`、`--font-display` 等指向新值）
- Consumes: 无

- [x] **Step 1: 重写 `tokens.css`**

```css
:root {
  --bg-app: #f2f2f7;
  --bg-elevated: #ffffff;
  --label: #1c1c1e;
  --secondary: #8e8e93;
  --tertiary: #c7c7cc;
  --separator: rgba(60, 60, 67, 0.12);
  --fill: rgba(120, 120, 128, 0.12);
  --accent: #007aff;
  --danger: #ff3b30;
  --status-duty: #34c759;
  --status-rest: #8e8e93;
  --status-leave: #ff9500;
  --status-support: #007aff;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  --radius-group: 12px;
  --radius-pill: 980px;
  --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;

  /* 迁移期别名 — Task 7 在无引用后可删 */
  --bg0: var(--bg-app);
  --bg1: var(--bg-app);
  --ink: var(--label);
  --muted: var(--secondary);
  --accent-soft: var(--fill);
  --lime: var(--status-duty);
  --rest: var(--status-leave);
  --metric: var(--label);
  --metric-soft: var(--fill);
  --font-display: var(--font-body);
  --font-metric: var(--font-body);
}
```

- [x] **Step 2: 更新 `body` 与按钮基础（`global.css`）**

去掉径向/绿色渐变背景与衬线依赖。`.btn--primary`：`--accent` 实心胶囊、白字；`.btn--ghost`：透明/白底 + hairline + `--accent` 字色；`.btn--danger`：`--danger`。

```css
body {
  margin: 0;
  color: var(--label);
  font-family: var(--font-body);
  background: var(--bg-app);
  background-attachment: fixed;
}
```

- [x] **Step 3: `index.html` 删除 Google Fonts 的 `preconnect` 与 stylesheet `link`（三行相关标签）。**

- [x] **Step 4: 构建验收**

Run: `cd frontend && npm run build`  
Expected: exit 0。

- [ ] **Step 5: Commit**（仅当用户要求）

```bash
git add frontend/src/styles/tokens.css frontend/src/styles/global.css frontend/index.html
git commit -m "将全局色板与字体切到 iOS 浅色系统风格，为全站重设计打底。"
```

---

### Task 2: AppShell 顶栏（分段导航）

**Files:**
- Modify: `frontend/src/components/AppShell.jsx`
- Modify: `frontend/src/styles/global.css`（`.app-shell*`）

**Interfaces:**
- Consumes: Task 1 tokens
- Produces: 顶栏「工时工作站 | 分段 nav | 齿轮」；路由仍为 `/`、`/stats`

- [x] **Step 1: 调整 `AppShell.jsx`**

删除 `<p className="app-shell__brand-sub">Hours Station</p>`。保留品牌名、NavLink、设置按钮与 `SettingsModal`。

```jsx
<header className="app-shell__header">
  <div className="app-shell__brand">
    <h1 className="app-shell__brand-name">工时工作站</h1>
  </div>
  <div className="app-shell__header-right">
    <nav className="app-shell__nav" aria-label="主导航">
      {/* 现有 NavLink 映射不变 */}
    </nav>
    <button type="button" className="btn btn--ghost btn--icon app-shell__settings-btn" ...>
      <SettingsIcon />
    </button>
  </div>
</header>
```

- [x] **Step 2: CSS — 毛玻璃顶栏 + 分段**

```css
.app-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  background: rgba(242, 242, 247, 0.86);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--separator);
}
.app-shell__nav {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 10px;
  background: var(--fill);
}
.app-shell__nav-link {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--label);
  text-decoration: none;
}
.app-shell__nav-link.is-active {
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
}
.app-shell__brand-name {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--label);
  font-family: var(--font-body);
}
```

删除依赖绿色描边/衬线的旧 `.app-shell*` 规则；可删 `.app-shell__brand-sub` 规则。

- [x] **Step 3: 手动验收**

- 「工作日历 / 统计看板」切换正常
- 齿轮仍打开设置

- [ ] **Step 4: `npm run build` + Commit（若要求）**

```bash
git add frontend/src/components/AppShell.jsx frontend/src/styles/global.css
git commit -m "顶栏改为 iOS 分段导航样式，弱化品牌衬线装饰。"
```

---

### Task 3: 左侧月历 + 日历页工作区

**Files:**
- Modify: `frontend/src/styles/global.css`（`.calendar-page*`、`.month-calendar*`、`.metric*`）
- Modify: `frontend/src/components/MonthCalendar.jsx`（仅 class / 结构微调，逻辑不动）
- Modify: `frontend/src/pages/CalendarPage.jsx`（仅当窄屏 class 需要时）

**Interfaces:**
- Consumes: Task 1 tokens
- Produces: 左侧约 280px 紧凑月历 + 底部本月指标；右侧留给 DayPanel

- [x] **Step 1: 工作区网格**

```css
.calendar-page__workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 0;
}
```

月历侧：`border-right: 1px solid var(--separator)`；格子白底/灰底；选中态用 `--accent` 轻底，勿用厚重绿色块。

窄屏（例 `@media (max-width: 900px)`）：

```css
.calendar-page__workspace {
  grid-template-columns: 1fr;
  grid-template-rows: auto minmax(0, 1fr);
}
```

- [x] **Step 2: 指标行**

`registeredDays` / `monthTotalHours` 仍在月历下方。`.metric` 改为次要灰标签 + 强调数字，去掉旧「农场绿」芯片观感。

- [x] **Step 3: 验收**

- 切月、选日仍刷新右侧
- `is-paste-mode` 类仍可用（若 CalendarPage 有）

- [ ] **Step 4: Build + Commit（若要求）**

```bash
git add frontend/src/styles/global.css frontend/src/components/MonthCalendar.jsx frontend/src/pages/CalendarPage.jsx
git commit -m "压缩左侧月历视觉并固定窄栏，突出右侧当日主内容区。"
```

---

### Task 4: DayPanel 顶栏（标题行 + 一行短按钮）

**Files:**
- Modify: `frontend/src/components/DayPanel.jsx`（header JSX）
- Modify: `frontend/src/styles/global.css`（`.day-panel__header*`）

**Interfaces:**
- Consumes: 现有 `onAdd`、`setImportOpen`、`setPreviewOpen`、`onCopyDay`、`onClearDay`、`selectedDate`、`allCount`、`actionsLocked` 等
- Produces: 「新增」仅在 `day-panel__header-actions`；短标签 + 完整 `title`/`aria-label`（见文案表）

- [x] **Step 1: 重构 header 结构**

将当前 `day-panel__header-main`（标题+stats+summary）与 `day-panel__header-actions` 改为：

```jsx
<header className="day-panel__header">
  <div className="day-panel__header-top">
    <h2 className="day-panel__title">{formatDisplayDate(selectedDate)}</h2>
    <div className="day-panel__header-actions">
      <button type="button" className="btn btn--primary btn--sm" onClick={onAdd}
        disabled={/* 原「新增到岗」disabled 条件 */}
        title="新增到岗" aria-label="新增到岗">新增</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setImportOpen(true)}
        disabled={/* 原导入 disabled */}
        title="文本导入" aria-label="文本导入">导入</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPreviewOpen(true)}
        disabled={/* 原预览 disabled */}
        title="预览" aria-label="预览">预览</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onCopyDay}
        disabled={/* 原复制 disabled */}
        title="复制到…" aria-label="复制到其他日期">复制</button>
      <button type="button" className="btn btn--ghost btn--danger btn--sm" onClick={onClearDay}
        disabled={/* 原清空 disabled */}
        title="清空当日" aria-label="清空当日">清空</button>
    </div>
  </div>
  <p className="day-panel__stats">到岗 … · 本店合计 …</p>
  <p className="day-panel__summary">休息 … · 请假 … · 支援 …</p>
  <DayNoteEditor ... />
</header>
```

禁用条件与改前各按钮一致（含 `selectedDate`、`allCount`、`formMode`/`draftCopy`/`pasteMode`/`addingSupport`/`supportBusy`/`statusSyncBusy` 等）。

- [x] **Step 2: 从到岗 `section-head` 移除「新增到岗」按钮**，避免重复入口。空日提示改为「点击「新增」开始录入。」

- [x] **Step 3: CSS — 强制一行**

```css
.day-panel__header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.65rem 0 0.5rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--separator);
  flex-shrink: 0;
}
.day-panel__header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
}
.day-panel__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  min-width: 0;
  flex: 1;
  font-family: var(--font-body);
}
.day-panel__header-actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  max-width: 100%;
  overflow-x: auto;
}
.day-panel__header-actions .btn {
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
```

删除/改写 `@container day-panel` 里把 actions 整块堆到标题下的旧规则。

- [x] **Step 4: 验收**

- 五个短按钮与日期同一行
- 导入/预览/复制/清空/新增行为与改前一致

- [ ] **Step 5: Build + Commit（若要求）**

```bash
git add frontend/src/components/DayPanel.jsx frontend/src/styles/global.css
git commit -m "当日顶栏改为标题与一行短操作按钮并列，降低垂直占用。"
```

---

### Task 5: DayPanel 单列分组列表（取消双栏）

**Files:**
- Modify: `frontend/src/components/DayPanel.jsx`（`.day-panel__body` 内结构）
- Modify: `frontend/src/styles/global.css`（删 `.day-panel__columns` / `__col*`；分组卡片样式）

**Interfaces:**
- Consumes: 现有 `duty`/`rest`/`leave`/`support` 与 `StatusSection`、`EntryForm`、`SupportForm`、draft copy 等
- Produces: 纵向：到岗 → 休息 → 请假 → 支援；空组显示标题 + 暂无

- [x] **Step 1: 去掉双栏包装**

将：

```jsx
<div className="day-panel__columns">
  <div className="day-panel__col day-panel__col--duty">...</div>
  <div className="day-panel__col day-panel__col--status">...</div>
</div>
```

改为在 `.day-panel__body` 内按顺序直接渲染：

1. 到岗 `section`（含 create/edit 内联、`day-panel__list`）
2. 休息 `StatusSection`
3. 请假 `StatusSection`
4. 支援 `section`（含 `addingSupport` / `SupportForm` / 列表）

支援逻辑与 props 不变，仅 DOM 位置从「状态列」挪到列表末尾。

- [x] **Step 2: 行内状态点缀**

到岗行左侧 3px `border-left` 或伪元素用 `--status-duty`；休息/请假/支援 section-title 或行用对应 `--status-*`。勿整行大块染色。

- [x] **Step 3: CSS**

```css
.day-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: transparent;
}
.day-panel__section {
  background: var(--bg-elevated);
  border-radius: var(--radius-group);
  border: 1px solid var(--separator);
  overflow: hidden;
}
.day-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.day-panel__item {
  padding: 0.65rem 0.85rem;
  border-top: 1px solid var(--separator);
  background: transparent;
}
.day-panel__item--duty {
  border-left: 3px solid var(--status-duty);
}
```

删除 `.day-panel__columns`、`.day-panel__col`、`.day-panel__col--duty`、`.day-panel__col--status` 及媒体查询中的双栏回退。

- [x] **Step 4: 验收**

- 到岗按时间排序仍正确
- 编辑/删除/复制单人/休息请假加班/支援 CRUD 可用
- 空日提示仍在

- [ ] **Step 5: Build + Commit（若要求）**

```bash
git add frontend/src/components/DayPanel.jsx frontend/src/styles/global.css
git commit -m "当日详情改为单列分组列表，去掉到岗与状态双栏布局。"
```

---

### Task 6: 统计页 + 设置与业务 Modal 表面

**Files:**
- Modify: `frontend/src/pages/StatsPage.jsx`（可选 class；**字段不得改**）
- Modify: `frontend/src/components/StatsPeopleTable.jsx`（class 即可）
- Modify: `frontend/src/styles/global.css`（`.stats-page*`、`.stats-kpi*`、`.settings-modal*`、`.modal*`、导入/预览 modal）
- Modify: `frontend/src/components/SettingsModal.jsx`（分段导航视觉 class，逻辑不动）

**Interfaces:**
- Consumes: Task 1 tokens；现有 `total_hours`、`employee_count`、`attendance_person_days`
- Produces: 三张 KPI inset 卡 + 人员表分组卡；设置仍为居中 modal，三段：备注预设 / 花名册 / 工时计算

- [x] **Step 1: Stats KPI 表面（保留现有三字段）**

当前结构已是 `.stats-kpi` + 三个 `.stats-kpi__item`（当月总工时 / 登记人数 / 出勤人天）。**不要**改成四个卡或其它指标。只改 CSS：

```css
.stats-kpi {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}
.stats-kpi__item {
  background: var(--bg-elevated);
  border-radius: var(--radius-group);
  border: 1px solid var(--separator);
  padding: 1rem;
  box-shadow: none;
}
.stats-kpi__label {
  color: var(--secondary);
  font-size: 13px;
}
.stats-kpi__value {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--label);
  font-family: var(--font-body);
}
@media (max-width: 640px) {
  .stats-kpi {
    grid-template-columns: 1fr;
  }
}
```

人员表外包一层白底圆角卡（`.stats-page__table-section` 或表格容器）。

- [x] **Step 2: Modal + 设置分段**

`.modal-backdrop`：半透明黑；`.modal`：白底、大圆角（约 14px）、顶栏 `--separator`。主按钮蓝胶囊。`SettingsModal` 分区切换用与 AppShell 类似的 `fill` + active 白块（class 可复用或 `.settings-modal__tabs`）。不改保存/校验/导入逻辑。

- [x] **Step 3: 验收**

- 统计切月、三 KPI 与人员表正确
- 设置三区可开可存；花名册删除提示仍在
- 文本导入、预览 modal 主流程可用

- [ ] **Step 4: Build + Commit（若要求）**

```bash
git add frontend/src/pages/StatsPage.jsx frontend/src/components/StatsPeopleTable.jsx frontend/src/components/SettingsModal.jsx frontend/src/styles/global.css
git commit -m "统计页与设置/业务弹层统一为 iOS 卡片与 sheet 表面。"
```

---

### Task 7: 清理死 CSS / 旧 token 别名 + 全站目视验收

**Files:**
- Modify: `frontend/src/styles/tokens.css`、`frontend/src/styles/global.css`
- Grep 全 `frontend/src`

**Interfaces:**
- Consumes: Tasks 1–6 完成态
- Produces: 无未引用的 `.day-panel__columns` 等；构建通过

- [x] **Step 1: Grep 清理**

```bash
rg "day-panel__columns|day-panel__col--|font-display|Source Serif|DM Sans|Hours Station" frontend/src frontend/index.html
```

删除死规则；若组件仍引用旧 class 则改组件。旧 token 别名仅在 `rg "var\\(--bg0\\)|var\\(--lime\\)|..."` 无命中后从 `tokens.css` 删除。

- [x] **Step 2: 全功能手测清单（规格 §2）**

| 项 | 期望 |
|----|------|
| 选日 / 切月 | 右侧与指标更新 |
| 新增到岗 / 编辑 / 删除 | 成功 |
| 休息请假 + 加班清空 | 成功 |
| 支援 | 成功 |
| 文本导入预览提交 | 成功 |
| 预览复制 / 复制到… | 成功 |
| 清空当日 | 确认后清空 |
| 统计看板三 KPI + 表 | 正确 |
| 设置三区 | 可保存 |

- [x] **Step 3: `cd frontend && npm run build`** — Expected: 成功。

- [ ] **Step 4: Commit（若要求）**

```bash
git add frontend/src/styles/tokens.css frontend/src/styles/global.css frontend/src frontend/index.html
git commit -m "清理旧布局样式与无用 token，完成 iOS 风 UI 重设计收尾。"
```

---

## Spec coverage（自检）

| 规格章节 | 任务 |
|----------|------|
| §2 功能冻结 | Task 4–6 行为保持；Task 7 清单 |
| §3 App Shell | Task 2 |
| §4.1 左右分栏 + 月历指标 + 窄屏 | Task 3 |
| §4.2 当日顶栏 v3 + 文案表 | Task 4 + Decisions |
| §4.3 单列分组 + 空组暂无 | Task 5 |
| §4.4 Sheets 居中 Dialog | Task 6 + Decisions |
| §5 Tokens | Task 1 |
| §6 统计三 KPI | Task 6 |
| §7 设置三段 | Task 6 |
| §8 删死 CSS | Task 7 |
| 无 API 变更 | 全任务仅 frontend |

## Placeholder / 一致性自检

- 短按钮文案统一：新增 / 导入 / 预览 / 复制 / 清空
- 「新增」仅 header 一处
- KPI 仅为三项：`total_hours` / `employee_count` / `attendance_person_days`
- 状态色：`--status-duty|rest|leave|support`
- Modal：居中 Dialog，非 Drawer、非第三 Tab
- 无 TBD；验证以 build + 手测
