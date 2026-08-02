from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://hours:hours@localhost:5432/hours_station"
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


def get_settings() -> Settings:
    return Settings()
