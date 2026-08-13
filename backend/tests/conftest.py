import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.models import Employee, NotePreset, WorkEntry, HoursRuleTier  # noqa: F401
from app.main import app
from app.services.hours_rule_cache import clear_cached_tiers_for_tests, load_hours_rule_cache

TEST_DATABASE_URL = "postgresql+psycopg://hours:hours@localhost:5432/hours_station_test"

engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture(scope="session", autouse=True)
def prepare_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db):
    clear_cached_tiers_for_tests()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        load_hours_rule_cache(db)
        yield c
    app.dependency_overrides.clear()
    clear_cached_tiers_for_tests()
