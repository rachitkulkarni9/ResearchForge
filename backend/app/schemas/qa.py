from typing import Literal

from pydantic import BaseModel, Field


class AskQuestionRequest(BaseModel):
    paper_id: str
    question: str = Field(min_length=5, max_length=2000)


class EvidenceItem(BaseModel):
    source: str
    passage: str


class AskQuestionResponse(BaseModel):
    status: Literal["stated", "inferred", "hybrid", "not_stated", "insufficient_evidence"]
    question_type: Literal["direct_fact", "synthesis", "inference", "missing_info", "hybrid_reasoning"]
    answer: str
    evidence: list[EvidenceItem] = Field(default_factory=list)
    confidence: float = 0.0
    citations: list[str] = Field(default_factory=list)
