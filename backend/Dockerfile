FROM python:3.12-slim

# 国内镜像源（默认腾讯云公共源，切云/换源时通过 build-arg 覆盖）
ARG APT_MIRROR=mirrors.cloud.tencent.com
ARG PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple/

WORKDIR /app

# apt 走国内镜像 + BuildKit 缓存（重复构建复用已下载的包列表/包）
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends libpq5

COPY requirements.txt .
# pip 走国内镜像 + BuildKit 缓存依赖
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -i ${PIP_INDEX_URL} -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN sed -i 's/\r$//' /docker-entrypoint.sh \
  && chmod +x /docker-entrypoint.sh

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

ENTRYPOINT ["/docker-entrypoint.sh"]
