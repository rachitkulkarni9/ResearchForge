from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UserRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    email: str
    name: str
    password_hash: str = ""
    auth_provider: str = "local"
    auth_subject: str = ""
    default_workspace_id: str
    created_at: datetime = Field(default_factory=utc_now)


class WorkspaceRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    owner_user_id: str
    plan: str = "hackathon"
    created_at: datetime = Field(default_factory=utc_now)


class WorkspaceMemberRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    workspace_id: str
    user_id: str
    role: Literal["owner", "editor", "viewer"] = "owner"
    created_at: datetime = Field(default_factory=utc_now)


class PaperRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    workspace_id: str
    uploaded_by: str
    title: str
    filename: str
    pdf_gcs_path: str
    content_hash: str
    extracted_text_path: str | None = None
    status: Literal["pending", "processing", "completed", "failed"] = "pending"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class JobRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    workspace_id: str
    paper_id: str
    status: Literal["pending", "processing", "completed", "failed"] = "pending"
    attempt_count: int = 0
    error: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class UsageEventRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    workspace_id: str
    user_id: str
    event_type: str
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
