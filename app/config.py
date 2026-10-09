from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    canvas_base_url: str = ""
    canvas_api_token: str = ""

    @property
    def canvas_configured(self) -> bool:
        return bool(self.canvas_base_url.strip() and self.canvas_api_token.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
