from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.qa.service import QAService
from app.schemas.qa import AskQuestionRequest, AskQuestionResponse
from app.services.document_store import DocumentStore
from app.services.usage_service import UsageService
from app.utils.dependencies import get_document_store, get_qa_service, get_usage_service

router = APIRouter(tags=["qa"])


@router.post("/ask-question", response_model=AskQuestionResponse)
def ask_question(
    payload: AskQuestionRequest,
    current_user: dict = Depends(get_current_user),
    document_store: DocumentStore = Depends(get_document_store),
    qa_service: QAService = Depends(get_qa_service),
    usage_service: UsageService = Depends(get_usage_service),
) -> AskQuestionResponse:
    paper = document_store.get("papers", payload.paper_id)
    if not paper or paper["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(status_code=404, detail="Paper not found")

    output = document_store.get("paper_outputs", payload.paper_id)
    if not output:
        raise HTTPException(status_code=400, detail="Paper has not been processed yet")

    response = qa_service.answer_question(paper, output, payload.question)
    usage_service.track(current_user["workspace_id"], current_user["sub"], "paper.question_asked", {"paper_id": payload.paper_id, "status": response.status, "question_type": response.question_type})
    return response
