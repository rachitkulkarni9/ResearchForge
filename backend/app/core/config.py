from functools import lru_cache
from pathlib import Path
from typing import List
from urllib.parse import urlparse

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ResearchForge API"
    app_env: str = "development"
    frontend_url: str = "http://localhost:3000"
    api_base_url: str = "http://localhost:8000"
    jwt_secret: str = "change-me"
    jwt_expires_hours: int = 24
    session_cookie_name: str = "researchforge_session"
    session_cookie_secure: bool | None = None
    session_cookie_samesite: str | None = None
    session_cookie_domain: str = ""
    max_upload_mb: int = 25
    sandbox_exec_timeout_seconds: int = 8
    sandbox_output_limit_chars: int = 12000
    sandbox_install_timeout_seconds: int = 120
    gcp_project_id: str = ""
    firebase_project_id: str = ""
    gcp_location: str = "us-central1"
    google_application_credentials: str = ""
    use_vertex_ai: bool = False
    firestore_database: str = "(default)"
    gcs_bucket_papers: str = ""
    gcs_bucket_sandbox: str = ""
    vertex_model: str = "gemini-2.5-flash"
    allow_local_store_fallback: bool = True
    local_data_dir: str = "./.paperlab_data"
    cors_origins: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @computed_field  # type: ignore[misc]
    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @computed_field  # type: ignore[misc]
    @property
    def effective_session_cookie_secure(self) -> bool:
        if self.session_cookie_secure is not None:
            return self.session_cookie_secure
        frontend_scheme = urlparse(self.frontend_url).scheme
        api_scheme = urlparse(self.api_base_url).scheme
        return frontend_scheme == "https" and api_scheme == "https"

    @computed_field  # type: ignore[misc]
    @property
    def effective_session_cookie_samesite(self) -> str:
        if self.session_cookie_samesite:
            return self.session_cookie_samesite.lower()

        frontend = urlparse(self.frontend_url)
        api = urlparse(self.api_base_url)
        if frontend.hostname and api.hostname and frontend.hostname != api.hostname:
            return "none" if self.effective_session_cookie_secure else "lax"
        return "lax"

    def validate_production_settings(self) -> list[str]:
        if self.app_env.lower() != "production":
            return []

        errors: list[str] = []
        frontend = urlparse(self.frontend_url)
        api = urlparse(self.api_base_url)

        if self.jwt_secret == "change-me" or len(self.jwt_secret) < 32:
            errors.append("JWT_SECRET must be set to a strong production secret with at least 32 characters.")
        if self.allow_local_store_fallback:
            errors.append("ALLOW_LOCAL_STORE_FALLBACK must be false in production so auth and paper data use persistent storage.")
        if frontend.scheme != "https":
            errors.append("FRONTEND_URL must use https in production.")
        if api.scheme != "https":
            errors.append("API_BASE_URL must use https in production.")
        if not self.effective_session_cookie_secure:
            errors.append("Session cookies must be secure in production. Set SESSION_COOKIE_SECURE=true.")
        if self.effective_session_cookie_samesite not in {"lax", "strict", "none"}:
            errors.append("SESSION_COOKIE_SAMESITE must resolve to lax, strict, or none.")
        if frontend.hostname and api.hostname and frontend.hostname != api.hostname and self.effective_session_cookie_samesite != "none":
            errors.append("When frontend and backend are on different domains in production, SESSION_COOKIE_SAMESITE must be none.")
        if self.effective_session_cookie_samesite == "none" and not self.effective_session_cookie_secure:
            errors.append("SESSION_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true.")
        if self.frontend_url not in self.cors_origin_list:
            errors.append("CORS_ORIGINS must include FRONTEND_URL in production.")
        return errors


@lru_cache
def get_settings() -> Settings:
    return Settings()
