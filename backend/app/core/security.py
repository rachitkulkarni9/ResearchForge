import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from google.auth.exceptions import DefaultCredentialsError

from app.core.config import Settings, get_settings
from app.services.firebase_auth_service import FirebaseAuthService
from app.services.workspace_service import WorkspaceService
from app.utils.dependencies import get_firebase_auth_service, get_workspace_service


def create_access_token(payload: Dict[str, Any], settings: Settings) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expires_hours)
    token_payload = {**payload, "exp": expires_at}
    return jwt.encode(token_payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str, settings: Settings) -> Dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt, expected = password_hash.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000)
    return hmac.compare_digest(digest.hex(), expected)


def get_bearer_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return authorization.replace("Bearer ", "", 1)


def get_session_token(
    request: Request,
    settings: Settings = Depends(get_settings),
    authorization: str | None = Header(default=None),
) -> str:
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "", 1)
    session_token = request.cookies.get(settings.session_cookie_name)
    if session_token:
        return session_token
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session")


def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
    firebase_auth_service: FirebaseAuthService = Depends(get_firebase_auth_service),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
) -> Dict[str, Any]:
    authorization = request.headers.get("Authorization")
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "", 1)
        try:
            claims = firebase_auth_service.verify_id_token(token)
        except DefaultCredentialsError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Firebase Admin credentials are not configured on the backend.",
            ) from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Firebase token") from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
        user, _workspace = workspace_service.sync_firebase_user(claims)
        return {
            "sub": user["id"],
            "email": user["email"],
            "workspace_id": user["default_workspace_id"],
            "auth_provider": "firebase",
            "firebase_uid": claims["uid"],
        }

    token = get_session_token(request=request, settings=settings, authorization=authorization)
    return decode_access_token(token, settings)
