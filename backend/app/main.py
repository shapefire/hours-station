from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import SessionLocal
from app.routers import calendar, employees, entries, settings as settings_router, stats
from app.services.hours_rule_cache import load_hours_rule_cache

settings = get_settings()
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        load_hours_rule_cache(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    yield


app = FastAPI(title="hours-station", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(entries.router)
app.include_router(employees.router)
app.include_router(calendar.router)
app.include_router(stats.router)
app.include_router(settings_router.router)
