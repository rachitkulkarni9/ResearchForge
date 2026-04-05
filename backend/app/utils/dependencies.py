from functools import lru_cache

from app.core.config import get_settings
from app.orchestrator.pipeline import PaperPipelineOrchestrator
from app.qa.service import QAService
from app.sandbox.executor import SandboxExecutor
from app.services.blob_store import BlobStore
from app.services.document_store import DocumentStore
from app.services.firebase_auth_service import FirebaseAuthService
from app.services.gemini_service import GeminiService
from app.services.job_runner import JobRunner
from app.services.pdf_service import PdfExtractionService
from app.services.usage_service import UsageService
from app.services.workspace_service import WorkspaceService


@lru_cache
def get_document_store() -> DocumentStore:
    return DocumentStore(get_settings())


@lru_cache
def get_blob_store() -> BlobStore:
    return BlobStore(get_settings())


@lru_cache
def get_pdf_service() -> PdfExtractionService:
    return PdfExtractionService()


@lru_cache
def get_gemini_service() -> GeminiService:
    return GeminiService(get_settings())


@lru_cache
def get_firebase_auth_service() -> FirebaseAuthService:
    return FirebaseAuthService(get_settings())


@lru_cache
def get_workspace_service() -> WorkspaceService:
    return WorkspaceService(get_document_store())


@lru_cache
def get_usage_service() -> UsageService:
    return UsageService(get_document_store())


@lru_cache
def get_sandbox_executor() -> SandboxExecutor:
    return SandboxExecutor(get_settings())


@lru_cache
def get_job_runner() -> JobRunner:
    return JobRunner()


@lru_cache
def get_qa_service() -> QAService:
    return QAService(get_blob_store(), get_gemini_service())


@lru_cache
def get_orchestrator() -> PaperPipelineOrchestrator:
    return PaperPipelineOrchestrator(
        document_store=get_document_store(),
        blob_store=get_blob_store(),
        pdf_service=get_pdf_service(),
        gemini_service=get_gemini_service(),
    )
