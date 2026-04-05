from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PaperSummary(BaseModel):
    id: str
    workspace_id: str
    title: str
    filename: str
    status: Literal["pending", "processing", "completed", "failed"]
    created_at: datetime
    updated_at: datetime


class UploadPaperResponse(BaseModel):
    paper: PaperSummary
    job: dict
    already_exists: bool = False
    message: str | None = None


class ReprocessPaperResponse(BaseModel):
    paper: PaperSummary
    job: dict
    message: str


class JobStatusResponse(BaseModel):
    id: str
    paper_id: str
    status: Literal["pending", "processing", "completed", "failed"]
    attempt_count: int
    error: str | None = None
    updated_at: datetime


class SectionModel(BaseModel):
    title: str
    summary: str


class MathExplanationModel(BaseModel):
    concept: str
    formula: str = ""
    variable_notes: list[str] = Field(default_factory=list)
    explanation: str
    importance: str = ""
    source_type: str = "text"
    source_context: str = ""


class ImplementationStepModel(BaseModel):
    step: str
    detail: str


class SandboxTaskModel(BaseModel):
    title: str
    objective: str


class StructuredPaperOutput(BaseModel):
    summary: str
    sections: list[SectionModel] = Field(default_factory=list)
    key_insights: list[str] = Field(default_factory=list)
    novel_contributions: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    math_explanations: list[MathExplanationModel] = Field(default_factory=list)
    implementation_steps: list[ImplementationStepModel] = Field(default_factory=list)
    sandbox_tasks: list[SandboxTaskModel] = Field(default_factory=list)
    starter_code: str
    qa_ready: bool
    fallback_mode: bool = False


class PaperDetailResponse(BaseModel):
    paper: PaperSummary
    output: StructuredPaperOutput | None = None
    sandbox: dict | None = None
