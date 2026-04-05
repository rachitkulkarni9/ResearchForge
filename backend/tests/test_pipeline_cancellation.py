import shutil
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.models.domain import JobRecord, PaperRecord
from app.orchestrator.pipeline import PaperPipelineOrchestrator
from app.services.blob_store import BlobStore
from app.services.document_store import DocumentStore


class DummyPdfService:
    def extract_text_from_bytes(self, pdf_bytes: bytes) -> str:
        return "attention paper text"

    def extract_equation_images_from_bytes(self, pdf_bytes: bytes) -> list[dict]:
        return []


class DummyGeminiService:
    def should_fallback(self, exc: Exception) -> bool:
        return False


class PipelineCancellationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.test_root = Path(".paperlab_pipeline_cancel_test")
        shutil.rmtree(self.test_root, ignore_errors=True)
        self.settings = Settings(
            local_data_dir=str(self.test_root),
            allow_local_store_fallback=True,
            jwt_secret="test-secret",
        )
        self.document_store = DocumentStore(self.settings)
        self.blob_store = BlobStore(self.settings)
        self.pdf_service = DummyPdfService()
        self.gemini_service = DummyGeminiService()
        self.orchestrator = PaperPipelineOrchestrator(
            document_store=self.document_store,
            blob_store=self.blob_store,
            pdf_service=self.pdf_service,
            gemini_service=self.gemini_service,
        )

    def tearDown(self) -> None:
        shutil.rmtree(self.test_root, ignore_errors=True)

    def test_deleted_paper_stops_pipeline_without_recreating_records(self) -> None:
        pdf_path = self.blob_store.upload_bytes("local-papers", "papers/workspace-1/paper-1/source.pdf", b"%PDF", "application/pdf")
        paper = PaperRecord(
            id="paper-1",
            workspace_id="workspace-1",
            uploaded_by="user-1",
            title="Paper",
            filename="paper.pdf",
            pdf_gcs_path=pdf_path,
            content_hash="hash",
        ).model_dump(mode="json")
        job = JobRecord(id="job-1", workspace_id="workspace-1", paper_id="paper-1").model_dump(mode="json")
        self.document_store.upsert("papers", "paper-1", paper)
        self.document_store.upsert("jobs", "job-1", job)

        store = self.document_store

        class DummyIngestionAgent:
            def __init__(self, gemini_service: object):
                pass

            def run(self, paper_text: str, context: dict) -> dict:
                return {"clean_text": paper_text}

        class CancelingSummaryAgent:
            def __init__(self, gemini_service: object):
                pass

            def run(self, clean_text: str, context: dict) -> dict:
                store.delete("papers", "paper-1")
                store.delete("jobs", "job-1")
                return {"summary": "cancelled"}

        class DummyInsightAgent:
            def __init__(self, gemini_service: object):
                pass

            def run(self, clean_text: str, context: dict) -> dict:
                return {"math_explanations": []}

        class DummyImplementationAgent:
            def __init__(self, gemini_service: object):
                pass

            def run(self, clean_text: str, context: dict) -> dict:
                return {"starter_code": 'print("ok")\n'}

        class DummyOrchestratorAgent:
            def __init__(self, gemini_service: object):
                pass

            def run(self, clean_text: str, context: dict) -> dict:
                return {"starter_code": 'print("ok")\n'}

        with (
            patch("app.orchestrator.pipeline.IngestionAgent", DummyIngestionAgent),
            patch("app.orchestrator.pipeline.SummaryAgent", CancelingSummaryAgent),
            patch("app.orchestrator.pipeline.InsightAgent", DummyInsightAgent),
            patch("app.orchestrator.pipeline.ImplementationAgent", DummyImplementationAgent),
            patch("app.orchestrator.pipeline.OrchestratorAgent", DummyOrchestratorAgent),
        ):
            self.orchestrator.process_job("job-1")

        self.assertIsNone(self.document_store.get("papers", "paper-1"))
        self.assertIsNone(self.document_store.get("jobs", "job-1"))
        self.assertIsNone(self.document_store.get("paper_outputs", "paper-1"))
        self.assertIsNone(self.document_store.get("sandbox_sessions", "paper-1"))


if __name__ == "__main__":
    unittest.main()
