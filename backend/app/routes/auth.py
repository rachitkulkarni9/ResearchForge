from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.security import create_access_token
from app.schemas.auth import AuthRequest, AuthResponse
from app.services.usage_service import UsageService
from app.services.workspace_service import WorkspaceService
from app.utils.dependencies import get_usage_service, get_workspace_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthResponse)
@router.post("/register", response_model=AuthResponse)
def login_or_register(
    payload: AuthRequest,
    settings: Settings = Depends(get_settings),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
    usage_service: UsageService = Depends(get_usage_service),
) -> AuthResponse:
    user = workspace_service.get_user_by_email(payload.email)
    if not user:
        user, workspace = workspace_service.create_user_with_workspace(payload.email, payload.name)
    else:
        workspace = workspace_service.document_store.get("workspaces", user["default_workspace_id"])

    token = create_access_token(
        {
            "sub": user["id"],
            "email": user["email"],
            "workspace_id": user["default_workspace_id"],
        },
        settings,
    )
    usage_service.track(user["default_workspace_id"], user["id"], "auth.login", {"email": user["email"]})
    return AuthResponse(access_token=token, user=user, workspace=workspace)
