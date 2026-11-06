# 国内镜像加速（Docker / pip / apt / npm）

境内构建镜像慢的根源是访问境外源（Docker Hub、pypi.org、deb.debian.org、registry.npmjs.org）。
本仓库的 Dockerfile 已内置国内镜像源（默认腾讯云公共源，可用 build-arg 覆盖），
但**基础镜像的拉取需要在服务器上做一次性配置**。

## 1. 基础镜像加速（一次性，在服务器上执行）

`python:3.12-slim`、`node:20-alpine`、`nginx:1.27-alpine`、`postgres:16` 都来自 Docker Hub。
配置 Docker daemon 的 `registry-mirrors` 即可加速：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.1ms.run",
    "https://docker.m.daocloud.io"
  ]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

- 第一行 `mirror.ccs.tencentyun.com` 是腾讯云内网镜像，最快，**仅腾讯云内网可用**。
- 后两行是公共镜像，用于兜底；Docker 按顺序尝试，某一行不可用会自动降级到下一行。
- **迁云时**：删掉第一行（腾讯云内网）或换成新云的镜像即可，公共镜像两行可保留。

> 提示：Docker Hub 公共加速源变动频繁，若某天失效，可到
> [dongyubin/DockerHub](https://github.com/dongyubin/DockerHub) 查最新可用列表。

### 验证是否生效

```bash
docker info | grep -A5 'Registry Mirrors'
# 或直接拉一个镜像测试速度：
docker pull hello-world
```

## 2. 包管理器镜像源（已写入 Dockerfile，无需手动操作）

| 环节 | 默认源 | 覆盖方式 |
|------|--------|----------|
| pip | `https://mirrors.cloud.tencent.com/pypi/simple/` | compose `build.args.PIP_INDEX_URL` 或 `--build-arg PIP_INDEX_URL=...` |
| apt (Debian) | `mirrors.cloud.tencent.com` | compose `build.args.APT_MIRROR` 或 `--build-arg APT_MIRROR=...` |
| npm | `https://registry.npmmirror.com` | 改 `frontend/.npmrc` |

- pip / apt 默认走腾讯云公共源（全网可访问，迁云不会失效）；想更快可覆盖为新云的公共源。
- npm 走 npmmirror（阿里），通用稳定。

常用公共源备选：

- PyPI：阿里 `https://mirrors.aliyun.com/pypi/simple/`、清华 `https://pypi.tuna.tsinghua.edu.cn/simple/`
- Debian：阿里 `mirrors.aliyun.com`、清华 `mirrors.tuna.tsinghua.edu.cn`

## 3. 构建缓存（已内置）

Dockerfile 已使用 BuildKit `--mount=type=cache` 缓存 pip/npm/apt 依赖，
重复构建（只改业务代码时）会复用缓存，显著缩短耗时。

> 需要 BuildKit：Docker 23+ 与 docker compose v2 默认已开启，无需额外配置。
