from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.config import Settings, get_settings
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.schemas.auth import AuthResponse, LoginRequest, LogoutResponse, SignupRequest
from app.services.usage_service import UsageService
from app.services.workspace_service import WorkspaceService
from app.utils.dependencies import get_usage_service, get_workspace_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "default_workspace_id": user["default_workspace_id"],
    }


def _set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.effective_session_cookie_secure,
        samesite=settings.effective_session_cookie_samesite,
        max_age=settings.jwt_expires_hours * 3600,
        path="/",
        domain=settings.session_cookie_domain or None,
    )


def _build_auth_response(user: dict, workspace: dict) -> AuthResponse:
    return AuthResponse(user=_public_user(user), workspace=workspace)


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignupRequest,
    response: Response,
    settings: Settings = Depends(get_settings),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
    usage_service: UsageService = Depends(get_usage_service),
) -> AuthResponse:
    existing_user = workspace_service.get_user_by_email(payload.email)
    if existing_user and existing_user.get("password_hash"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")
    if existing_user:
        existing_user["name"] = payload.name
        existing_user["password_hash"] = hash_password(payload.password)
        user = workspace_service.update_user(existing_user)
        workspace = workspace_service.document_store.get("workspaces", user["default_workspace_id"])
        if not workspace:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    else:
        user, workspace = workspace_service.create_user_with_workspace(
            payload.email,
            payload.name,
            hash_password(payload.password),
        )
    token = create_access_token(
        {
            "sub": user["id"],
            "email": user["email"],
            "workspace_id": user["default_workspace_id"],
        },
        settings,
    )
    _set_session_cookie(response, token, settings)
    usage_service.track(user["default_workspace_id"], user["id"], "auth.signup", {"email": user["email"]})
    return _build_auth_response(user, workspace)


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    response: Response,
    settings: Settings = Depends(get_settings),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
    usage_service: UsageService = Depends(get_usage_service),
) -> AuthResponse:
    user = workspace_service.get_user_by_email(payload.email)
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    workspace = workspace_service.document_store.get("workspaces", user["default_workspace_id"])
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    token = create_access_token(
        {
            "sub": user["id"],
            "email": user["email"],
            "workspace_id": user["default_workspace_id"],
        },
        settings,
    )
    _set_session_cookie(response, token, settings)
    usage_service.track(user["default_workspace_id"], user["id"], "auth.login", {"email": user["email"]})
    return _build_auth_response(user, workspace)


@router.post("/logout", response_model=LogoutResponse)
def logout(
    response: Response,
    settings: Settings = Depends(get_settings),
) -> LogoutResponse:
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        domain=settings.session_cookie_domain or None,
        secure=settings.effective_session_cookie_secure,
        samesite=settings.effective_session_cookie_samesite,
    )
    return LogoutResponse()


@router.get("/session", response_model=AuthResponse)
def get_session(
    current_user: dict = Depends(get_current_user),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
) -> AuthResponse:
    user = workspace_service.document_store.get("users", current_user["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session user not found")
    workspace = workspace_service.document_store.get("workspaces", current_user["workspace_id"])
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return _build_auth_response(user, workspace)
