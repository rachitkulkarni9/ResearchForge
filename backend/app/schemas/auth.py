from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserSummary(BaseModel):
    id: str
    email: EmailStr
    name: str
    default_workspace_id: str


class WorkspaceSummary(BaseModel):
    id: str
    name: str
    owner_user_id: str
    plan: str


class AuthResponse(BaseModel):
    authenticated: bool = True
    token_type: Literal["session"] = "session"
    user: UserSummary
    workspace: WorkspaceSummary


class LogoutResponse(BaseModel):
    ok: bool = True
