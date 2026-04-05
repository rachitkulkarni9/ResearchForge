from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.routes.auth import router as auth_router
from app.routes.papers import router as papers_router
from app.routes.qa import router as qa_router
from app.routes.sandbox import router as sandbox_router

configure_logging()
settings = get_settings()
production_errors = settings.validate_production_settings()
if production_errors:
    raise RuntimeError("Invalid production configuration:\n- " + "\n- ".join(production_errors))
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "environment": settings.app_env}


app.include_router(auth_router)
app.include_router(papers_router)
app.include_router(qa_router)
app.include_router(sandbox_router)
