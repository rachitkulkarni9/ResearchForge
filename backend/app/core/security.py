from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt
from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings


def create_access_token(payload: Dict[str, Any], settings: Settings) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expires_hours)
    token_payload = {**payload, "exp": expires_at}
    return jwt.encode(token_payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str, settings: Settings) -> Dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


def get_bearer_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return authorization.replace("Bearer ", "", 1)


def get_current_user(
    token: str = Depends(get_bearer_token),
    settings: Settings = Depends(get_settings),
) -> Dict[str, Any]:
    return decode_access_token(token, settings)
