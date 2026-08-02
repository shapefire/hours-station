from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import calendar, employees, entries, settings as settings_router, stats

settings = get_settings()
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

app = FastAPI(title="hours-station")
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
