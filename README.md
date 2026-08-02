# Hours Station（工时工作站）

本地工时登记与管理者统计：月历一屏、日明细 CRUD、整日/单人复制、当日预览复制、含休息日的统计看板。无登录。

设计规格：`docs/superpowers/specs/2026-08-02-hours-station-design.md`

## 功能概览

- **工作日历**：左月历（有数据格默认显示人数与工时）+ 右日明细
- **登记**：姓名组合框（花名册 / 自由输入 / 当月已排工时）；时分弹层（分钟 00/30）
- **复制**：整日粘贴模式；单人顶部草稿（可改姓名、时段、备注）
- **预览**：当日安排格式化文本 + 一键复制（首行含日期与合计工时）
- **清空当日**：删除选中日全部安排
- **花名册**：软删除移出下拉；历史保留；同名再录可复活
- **统计看板**：月 KPI、按人汇总、逐日含休息
- **视觉**：墨绿纸感；人数 / 工时 / 天数 Metric 强调

## 环境要求

- **一键部署：** Docker + Docker Compose
- **本地开发：** Python 3.11+、Node.js 20+、PostgreSQL 16

数据库约定（与 `docker-compose.yml` / `.env.example` / `backend/.env.example` 一致）：

| 项 | 值 |
| --- | --- |
| 用户 / 密码 | `hours` / `hours` |
| 库名 | `hours_station` |
| 连接串（本机开发） | `postgresql+psycopg://hours:hours@localhost:5432/hours_station` |

本地若使用其它账号，在 `backend/.env` 中设置 `DATABASE_URL`（密码中的 `@` 需 URL 编码为 `%40`）。

## Docker 一键部署（推荐）

同机构建并启动 **Postgres + 后端 + Nginx 前端**；浏览器只访问一个端口（默认 **8810**），`/api` 由 Nginx 反代。

```powershell
# 在仓库实现目录（含 docker-compose.yml）
cd .worktrees/hours-station   # 若已在该目录可省略

copy .env.example .env        # 可选；改端口/密码时再编辑
docker compose up -d --build
```

打开 [http://localhost:8810](http://localhost:8810)。

常用运维：

```powershell
docker compose ps
docker compose logs -f
docker compose down            # 停服务（保留数据卷）
docker compose down -v         # 停服务并清空数据库卷
```

改对外端口：编辑 `.env` 中 `APP_PORT`（同时把 `CORS_ORIGINS` 改成对应地址），再 `docker compose up -d`。

> 一键部署时 Postgres **不映射到宿主机**；仅容器内网 `db:5432`。本地开发若需连库，见下方「本地启动」。

## 本地启动（Windows）

### 1. 数据库

使用本机 Postgres，或临时只起数据库容器（需自行在 `docker-compose.yml` 为 `db` 增加 `ports: ["5432:5432"]`，或单独跑 Postgres）。

创建用户/密码/库 `hours` / `hours` / `hours_station`，并确保监听 `5432`。

### 2. 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
copy .env.example .env
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

若 `8000` 已被占用：

```powershell
uvicorn app.main:app --reload --port 8001
```

并在启动前端前设置代理目标（见下一步）。

### 3. 前端

新开一个终端：

```powershell
cd frontend
npm install
npm run dev
```

默认代理到 `http://127.0.0.1:8000`。若后端改用 `8001`：

```powershell
$env:VITE_API_PROXY = "http://127.0.0.1:8001"
npm run dev
```

`vite.config.js` 读取 `process.env.VITE_API_PROXY`，未设置时回退到 `http://127.0.0.1:8000`。

浏览器打开 Vite 提示的地址（通常 `http://localhost:5173`）。

## 常用命令

```powershell
# 后端测试
cd backend
.\.venv\Scripts\activate
pytest

# 前端生产构建
cd frontend
npm run build
```

## 手动 E2E 验收清单

Docker 一键部署后打开 `http://localhost:8810`，或本地开发启动前后端后，在浏览器中逐项确认：

- [ ] **登记**：在月历进入某日，新增员工工时记录并成功保存
- [ ] **唯一性**：同一员工同一天不可重复登记（应有明确错误提示）
- [ ] **花名册**：下拉可见当月已排工时；× 可移出花名册；历史工时仍在
- [ ] **时间**：时/分弹层可选分钟 `00` / `30`
- [ ] **复制**：整日复制粘贴模式可用；单人顶部草稿可改时段后完成
- [ ] **新增置顶**：当日数据较多时，点新增/单人复制无需下滑即可填写
- [ ] **预览**：预览弹窗展示日期与合计；复制后微信可粘贴（首行为日期+合计）
- [ ] **清空当日**：确认后清空选中日全部安排
- [ ] **统计休息**：统计看板摘要与按人表正确；逐日明细含休息日与休息天数
- [ ] **月历一屏**：有数据格默认显示「X人 · Yh」；整月网格无需纵向滚动
- [ ] **数字强调**：人数 / 工时 / 天数以 Metric 样式与正文区分
