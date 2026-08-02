#!/usr/bin/env bash
# One-click deploy on a remote server:
#   pull latest code -> rebuild images -> recreate & restart services
#
# Usage (from repo root or any cwd):
#   ./deploy.sh
#   DEPLOY_BRANCH=main ./deploy.sh
#   APP_PORT=8810 ./deploy.sh   # APP_PORT is read from .env by compose

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BRANCH="${DEPLOY_BRANCH:-main}"
COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    echo "error: docker compose is required" >&2
    exit 1
  fi
fi

echo "==> repo: $ROOT"
echo "==> branch: $BRANCH"

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    echo "==> created .env from .env.example (edit secrets/ports if needed)"
  else
    echo "error: missing .env and .env.example" >&2
    exit 1
  fi
fi

if [[ ! -d .git ]]; then
  echo "error: not a git repository: $ROOT" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: invalid git work tree" >&2
  exit 1
fi

echo "==> fetching origin..."
git fetch --prune origin

if ! git show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
  echo "error: remote branch origin/${BRANCH} not found" >&2
  exit 1
fi

echo "==> syncing to origin/${BRANCH}..."
git checkout -B "$BRANCH" "origin/${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "==> rebuilding images and restarting services..."
"${COMPOSE[@]}" up -d --build --remove-orphans

echo "==> pruning dangling images..."
docker image prune -f >/dev/null || true

echo "==> service status"
"${COMPOSE[@]}" ps

APP_PORT="$(grep -E '^APP_PORT=' .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
APP_PORT="${APP_PORT:-8810}"
echo
echo "Deploy finished. Open http://<server-host>:${APP_PORT}"
echo "Logs: ${COMPOSE[*]} logs -f --tail=100"
