from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str = "postgresql+psycopg://hours:hours@localhost:5432/hours_station"
    cors_origins: str = "http://localhost:5173"


def get_settings() -> Settings:
    return Settings()
