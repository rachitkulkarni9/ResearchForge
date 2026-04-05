import hashlib
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import Settings, get_settings
from app.core.security import get_current_user
from app.models.domain import JobRecord, PaperRecord
from app.schemas.paper import JobStatusResponse, PaperDetailResponse, PaperSummary, ReprocessPaperResponse, UploadPaperResponse
from app.services.blob_store import BlobStore
from app.services.document_store import DocumentStore
from app.services.job_runner import JobRunner
from app.services.usage_service import UsageService
from app.services.workspace_service import WorkspaceService
from app.utils.dependencies import get_blob_store, get_document_store, get_job_runner, get_orchestrator, get_usage_service, get_workspace_service

router = APIRouter(tags=["papers"])


def ensure_workspace_access(workspace_service: WorkspaceService, workspace_id: str, user_id: str) -> None:
    member = workspace_service.get_workspace_member(workspace_id, user_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace access denied")


@router.post("/upload-paper", response_model=UploadPaperResponse)
async def upload_paper(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    document_store: DocumentStore = Depends(get_document_store),
    blob_store: BlobStore = Depends(get_blob_store),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
    usage_service: UsageService = Depends(get_usage_service),
    job_runner: JobRunner = Depends(get_job_runner),
) -> UploadPaperResponse:
    workspace_id = current_user["workspace_id"]
    ensure_workspace_access(workspace_service, workspace_id, current_user["sub"])

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported")

    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds upload size limit")

    content_hash = hashlib.sha256(content).hexdigest()
    existing_papers = document_store.list("papers", {"workspace_id": workspace_id, "content_hash": content_hash})
    if existing_papers:
        existing_paper = existing_papers[0]
        jobs = document_store.list("jobs", {"workspace_id": workspace_id, "paper_id": existing_paper["id"]})
        if jobs:
            job = jobs[0]
        else:
            job = JobRecord(workspace_id=workspace_id, paper_id=existing_paper["id"]).model_dump(mode="json")
        usage_service.track(workspace_id, current_user["sub"], "paper.duplicate_upload", {"paper_id": existing_paper["id"]})
        return UploadPaperResponse(
            paper=PaperSummary(**existing_paper),
            job=job,
            already_exists=True,
            message="You've already uploaded this paper. Reusing the existing results.",
        )

    paper = PaperRecord(
        workspace_id=workspace_id,
        uploaded_by=current_user["sub"],
        title=Path(file.filename).stem,
        filename=file.filename,
        pdf_gcs_path="",
        content_hash=content_hash,
    )
    paper.pdf_gcs_path = blob_store.upload_bytes(
        settings.gcs_bucket_papers or "local-papers",
        f"papers/{workspace_id}/{paper.id}/source.pdf",
        content,
        "application/pdf",
    )

    job = JobRecord(workspace_id=workspace_id, paper_id=paper.id)
    document_store.upsert("papers", paper.id, paper.model_dump(mode="json"))
    document_store.upsert("jobs", job.id, job.model_dump(mode="json"))
    usage_service.track(workspace_id, current_user["sub"], "paper.uploaded", {"paper_id": paper.id})

    job_runner.submit(get_orchestrator().process_job, job.id)

    return UploadPaperResponse(
        paper=PaperSummary(**paper.model_dump()),
        job=job.model_dump(mode="json"),
        already_exists=False,
        message="Paper uploaded successfully. Processing has started.",
    )


@router.post("/paper/{paper_id}/reprocess", response_model=ReprocessPaperResponse)
def reprocess_paper(
    paper_id: str,
    current_user: dict = Depends(get_current_user),
    document_store: DocumentStore = Depends(get_document_store),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
    usage_service: UsageService = Depends(get_usage_service),
    job_runner: JobRunner = Depends(get_job_runner),
) -> ReprocessPaperResponse:
    workspace_id = current_user["workspace_id"]
    ensure_workspace_access(workspace_service, workspace_id, current_user["sub"])

    paper = document_store.get("papers", paper_id)
    if not paper or paper["workspace_id"] != workspace_id:
        raise HTTPException(status_code=404, detail="Paper not found")

    paper["status"] = "pending"
    paper["updated_at"] = datetime.now(timezone.utc).isoformat()
    document_store.upsert("papers", paper_id, paper)

    job = JobRecord(workspace_id=workspace_id, paper_id=paper_id)
    document_store.upsert("jobs", job.id, job.model_dump(mode="json"))
    usage_service.track(workspace_id, current_user["sub"], "paper.reprocessed", {"paper_id": paper_id, "job_id": job.id})
    job_runner.submit(get_orchestrator().process_job, job.id)

    return ReprocessPaperResponse(
        paper=PaperSummary(**paper),
        job=job.model_dump(mode="json"),
        message="Reprocessing started for this paper.",
    )


@router.get("/papers", response_model=list[PaperSummary])
def list_papers(
    current_user: dict = Depends(get_current_user),
    document_store: DocumentStore = Depends(get_document_store),
) -> list[PaperSummary]:
    papers = document_store.list("papers", {"workspace_id": current_user["workspace_id"]})
    return [PaperSummary(**paper) for paper in papers]


@router.get("/paper/{paper_id}", response_model=PaperDetailResponse)
def get_paper(
    paper_id: str,
    current_user: dict = Depends(get_current_user),
    document_store: DocumentStore = Depends(get_document_store),
) -> PaperDetailResponse:
    paper = document_store.get("papers", paper_id)
    if not paper or paper["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(status_code=404, detail="Paper not found")

    output = document_store.get("paper_outputs", paper_id)
    sandbox = document_store.get("sandbox_sessions", paper_id)
    return PaperDetailResponse(
        paper=PaperSummary(**paper),
        output=output,
        sandbox=sandbox,
    )


@router.get("/status/{job_id}", response_model=JobStatusResponse)
def get_status(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    document_store: DocumentStore = Depends(get_document_store),
) -> JobStatusResponse:
    job = document_store.get("jobs", job_id)
    if not job or job["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(**job)


@router.delete("/paper/{paper_id}")
def delete_paper(
    paper_id: str,
    current_user: dict = Depends(get_current_user),
    document_store: DocumentStore = Depends(get_document_store),
    blob_store: BlobStore = Depends(get_blob_store),
    workspace_service: WorkspaceService = Depends(get_workspace_service),
    usage_service: UsageService = Depends(get_usage_service),
) -> dict[str, str]:
    workspace_id = current_user["workspace_id"]
    ensure_workspace_access(workspace_service, workspace_id, current_user["sub"])

    paper = document_store.get("papers", paper_id)
    if not paper or paper["workspace_id"] != workspace_id:
        raise HTTPException(status_code=404, detail="Paper not found")

    blob_store.delete_path(paper.get("pdf_gcs_path", ""))
    blob_store.delete_path(paper.get("extracted_text_path", ""))

    output = document_store.get("paper_outputs", paper_id)
    if output:
        for key in ("source_text_path", "supporting_notes_path"):
            blob_store.delete_path(output.get(key, ""))
        document_store.delete("paper_outputs", paper_id)

    sandbox = document_store.get("sandbox_sessions", paper_id)
    if sandbox:
        document_store.delete("sandbox_sessions", paper_id)

    jobs = document_store.list("jobs", {"workspace_id": workspace_id, "paper_id": paper_id})
    for job in jobs:
        document_store.delete("jobs", job["id"])

    document_store.delete("papers", paper_id)
    usage_service.track(workspace_id, current_user["sub"], "paper.deleted", {"paper_id": paper_id})
    return {"message": "Paper deleted successfully."}
