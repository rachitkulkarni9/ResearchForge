from pydantic import BaseModel, Field


class SandboxRunRequest(BaseModel):
    paper_id: str
    code: str = Field(min_length=1)


class SandboxRunResponse(BaseModel):
    stdout: str = ""
    stderr: str = ""
    success: bool


class SandboxResetRequest(BaseModel):
    paper_id: str


class SandboxResetResponse(BaseModel):
    starter_code: str
