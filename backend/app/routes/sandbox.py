from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.schemas.sandbox import SandboxResetRequest, SandboxResetResponse, SandboxRunRequest, SandboxRunResponse
from app.services.document_store import DocumentStore
from app.services.usage_service import UsageService
from app.sandbox.executor import SandboxExecutor
from app.utils.dependencies import get_document_store, get_sandbox_executor, get_usage_service

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


@router.post("/run", response_model=SandboxRunResponse)
def run_sandbox(
    payload: SandboxRunRequest,
    current_user: dict = Depends(get_current_user),
    document_store: DocumentStore = Depends(get_document_store),
    sandbox_executor: SandboxExecutor = Depends(get_sandbox_executor),
    usage_service: UsageService = Depends(get_usage_service),
) -> SandboxRunResponse:
    session = document_store.get("sandbox_sessions", payload.paper_id)
    if not session or session["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(status_code=404, detail="Sandbox session not found")

    result = sandbox_executor.run_python(payload.code)
    session["current_code"] = payload.code
    session["last_run_output"] = result
    document_store.upsert("sandbox_sessions", payload.paper_id, session)
    usage_service.track(current_user["workspace_id"], current_user["sub"], "sandbox.run", {"paper_id": payload.paper_id})
    return SandboxRunResponse(**result)


@router.post("/reset", response_model=SandboxResetResponse)
def reset_sandbox(
    payload: SandboxResetRequest,
    current_user: dict = Depends(get_current_user),
    document_store: DocumentStore = Depends(get_document_store),
) -> SandboxResetResponse:
    session = document_store.get("sandbox_sessions", payload.paper_id)
    if not session or session["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(status_code=404, detail="Sandbox session not found")
    session["current_code"] = session["starter_code"]
    session["last_run_output"] = {"stdout": "", "stderr": "", "success": True}
    document_store.upsert("sandbox_sessions", payload.paper_id, session)
    return SandboxResetResponse(starter_code=session["starter_code"])
