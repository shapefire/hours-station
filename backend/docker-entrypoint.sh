#!/bin/sh
set -e

echo "Waiting for database..."
python - <<'PY'
import os
import sys
import time

from sqlalchemy import create_engine, text

url = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://hours:hours@db:5432/hours_station",
)
engine = create_engine(url, pool_pre_ping=True)

for attempt in range(60):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("Database is ready.")
        sys.exit(0)
    except Exception as exc:
        print(f"DB not ready ({attempt + 1}/60): {exc}")
        time.sleep(1)

print("Database did not become ready in time.", file=sys.stderr)
sys.exit(1)
PY

echo "Running migrations..."
alembic upgrade head

echo "Starting API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
