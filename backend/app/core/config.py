from functools import lru_cache
from typing import List

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "PaperLab API"
    app_env: str = "development"
    frontend_url: str = "http://localhost:3000"
    api_base_url: str = "http://localhost:8000"
    jwt_secret: str = "change-me"
    jwt_expires_hours: int = 24
    max_upload_mb: int = 25
    sandbox_exec_timeout_seconds: int = 8
    sandbox_output_limit_chars: int = 12000
    gcp_project_id: str = ""
    gcp_location: str = "us-central1"
    use_vertex_ai: bool = False
    firestore_database: str = "(default)"
    gcs_bucket_papers: str = ""
    gcs_bucket_sandbox: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    allow_local_store_fallback: bool = True
    local_data_dir: str = "./.paperlab_data"
    cors_origins: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @computed_field  # type: ignore[misc]
    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
