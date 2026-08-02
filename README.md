# Hours Station（工时站）

本地工时登记与管理者统计：月历一屏、日明细 CRUD、整日/单人复制粘贴、含休息日的统计看板。无登录。

## 环境要求

- Python 3.11+
- Node.js 20+
- PostgreSQL 16（本地实例或 Docker Compose）

数据库约定（与 `docker-compose.yml` / `backend/.env.example` 一致）：

| 项 | 值 |
| --- | --- |
| 用户 / 密码 | `hours` / `hours` |
| 库名 | `hours_station` |
| 连接串 | `postgresql+psycopg://hours:hours@localhost:5432/hours_station` |

## 本地启动（Windows）

### 1. 数据库（二选一）

**可选 — Docker Compose：**

```powershell
docker compose up -d
```

**或本地 Postgres：** 创建用户/密码/库 `hours` / `hours` / `hours_station`，并确保监听 `5432`。

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

启动前后端后，在浏览器中逐项确认：

- [ ] **登记**：在月历进入某日，新增员工工时记录并成功保存
- [ ] **唯一性**：同一员工同一天不可重复登记（应有明确错误提示）
- [ ] **复制**：整日复制粘贴模式可用；单人行内复制可用
- [ ] **统计休息**：统计看板摘要与按人表正确；逐日明细含休息日与休息天数
- [ ] **月历一屏**：月历视图在常见桌面分辨率下一屏展示、无需纵向滚动整月网格
