import logging
from datetime import datetime, timezone

from app.agents.ingestion_agent import IngestionAgent
from app.agents.insight_agent import InsightAgent
from app.agents.implementation_agent import ImplementationAgent
from app.agents.orchestrator_agent import OrchestratorAgent
from app.agents.summary_agent import SummaryAgent
from app.services.blob_store import BlobStore
from app.services.document_store import DocumentStore
from app.services.gemini_service import GeminiService
from app.services.pdf_service import PdfExtractionService

logger = logging.getLogger(__name__)


class PaperPipelineOrchestrator:
    def __init__(
        self,
        document_store: DocumentStore,
        blob_store: BlobStore,
        pdf_service: PdfExtractionService,
        gemini_service: GeminiService,
    ):
        self.document_store = document_store
        self.blob_store = blob_store
        self.pdf_service = pdf_service
        self.gemini_service = gemini_service

    def _update_job(self, job: dict) -> None:
        job["updated_at"] = datetime.now(timezone.utc).isoformat()
        self.document_store.upsert("jobs", job["id"], job)

    def _update_paper(self, paper: dict) -> None:
        paper["updated_at"] = datetime.now(timezone.utc).isoformat()
        self.document_store.upsert("papers", paper["id"], paper)

    def _save_completed_output(self, paper: dict, job: dict, merged: dict, fallback_mode: bool) -> None:
        self.document_store.upsert("paper_outputs", paper["id"], {**merged, "fallback_mode": fallback_mode})
        self.document_store.upsert(
            "sandbox_sessions",
            paper["id"],
            {
                "id": paper["id"],
                "workspace_id": paper["workspace_id"],
                "paper_id": paper["id"],
                "starter_code": merged["starter_code"],
                "current_code": merged["starter_code"],
                "last_run_output": {"stdout": "", "stderr": "", "success": True},
            },
        )

        job["status"] = "completed"
        job["error"] = None if not fallback_mode else "Completed in fallback mode because Gemini was unavailable"
        self._update_job(job)

        paper["status"] = "completed"
        self._update_paper(paper)

    def process_job(self, job_id: str) -> None:
        job = self.document_store.get("jobs", job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")

        paper = self.document_store.get("papers", job["paper_id"])
        if not paper:
            raise ValueError(f"Paper {job['paper_id']} not found")

        try:
            job["status"] = "processing"
            job["attempt_count"] += 1
            self._update_job(job)

            paper["status"] = "processing"
            self._update_paper(paper)

            pdf_bytes = self.blob_store.read_bytes(paper["pdf_gcs_path"])
            paper_text = self.pdf_service.extract_text_from_bytes(pdf_bytes)
            extracted_path = self.blob_store.upload_text(
                self.blob_store.settings.gcs_bucket_papers or "local-papers",
                f"papers/{paper['workspace_id']}/{paper['id']}/extracted.txt",
                paper_text,
            )
            paper["extracted_text_path"] = extracted_path
            self._update_paper(paper)

            ingestion = IngestionAgent(self.gemini_service).run(paper_text, {})

            try:
                summary = SummaryAgent(self.gemini_service).run(ingestion["clean_text"], ingestion)
                insights = InsightAgent(self.gemini_service).run(ingestion["clean_text"], ingestion)
                implementation = ImplementationAgent(self.gemini_service).run(ingestion["clean_text"], ingestion)
                merged = OrchestratorAgent(self.gemini_service).run(
                    ingestion["clean_text"],
                    {
                        "summary": summary,
                        "insights": insights,
                        "implementation": implementation,
                    },
                )
                self._save_completed_output(paper, job, merged, fallback_mode=False)
            except Exception as exc:
                if self.gemini_service.client and self.gemini_service.is_resource_exhausted_error(exc):
                    logger.warning("Gemini resource exhaustion detected, using fallback output for job %s", job_id)
                    merged = self.gemini_service.build_fallback_output(str(exc)).model_dump(mode="json")
                    self._save_completed_output(paper, job, merged, fallback_mode=True)
                else:
                    raise
        except Exception as exc:
            logger.exception("Pipeline failed for job %s", job_id)
            job["status"] = "failed"
            job["error"] = str(exc)
            self._update_job(job)
            paper["status"] = "failed"
            self._update_paper(paper)
