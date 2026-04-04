import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.qa.service import QAService
from app.services.blob_store import BlobStore
from app.services.gemini_service import GeminiService


class DummySettings:
    gcp_project_id = ""
    allow_local_store_fallback = True
    local_data_dir = "./.paperlab_test_data"
    gemini_api_key = ""
    gemini_model = "gemini-2.5-flash"


def build_service() -> QAService:
    settings = DummySettings()
    return QAService(BlobStore(settings), GeminiService(settings))


class QAServiceTests(unittest.TestCase):
    def test_classifies_direct_fact_question(self) -> None:
        service = build_service()
        self.assertEqual(service.classify_question("What dataset does the paper use?"), "direct_fact")

    def test_classifies_synthesis_question(self) -> None:
        service = build_service()
        self.assertEqual(service.classify_question("How does the architecture and evaluation evidence support the method?"), "synthesis")

    def test_classifies_inference_question(self) -> None:
        service = build_service()
        self.assertEqual(service.classify_question("Why might the model fail on noisy inputs?"), "inference")

    def test_classifies_missing_info_question(self) -> None:
        service = build_service()
        self.assertEqual(service.classify_question("What future work is not stated by the authors?"), "missing_info")

    def test_retrieval_pulls_multiple_relevant_chunks_for_deep_question(self) -> None:
        service = build_service()
        corpus = [
            ("abstract:0", "The model uses a sparse transformer architecture for long-context reasoning."),
            ("method:1", "Our method stacks a routing layer with mixture-of-experts blocks to improve efficiency."),
            ("experiments:2", "Evaluation on MMLU and GSM8K shows higher accuracy and lower latency than the baseline."),
            ("conclusion:3", "A limitation is sensitivity to retrieval noise and future work includes adaptive routing."),
        ]
        retrieved = service.retrieve("How do the architecture and evaluation results support the method?", corpus, "synthesis")
        self.assertGreaterEqual(len(retrieved), 2)
        sources = {item.source for item in retrieved}
        self.assertTrue(any(source.startswith("method") for source in sources))
        self.assertTrue(any(source.startswith("experiments") for source in sources))

    def test_missing_answer_returns_not_stated_when_evidence_is_weak(self) -> None:
        service = build_service()
        paper = {"extracted_text_path": None}
        output = {
            "summary": "The paper introduces a model for classification.",
            "sections": [],
            "key_insights": ["The model performs well on benchmarks."],
            "novel_contributions": [],
            "limitations": [],
            "math_explanations": [],
            "implementation_steps": [],
            "sandbox_tasks": [],
            "starter_code": "print('ok')",
            "qa_ready": True,
        }
        response = service.answer_question(paper, output, "What future work do the authors propose for retrieval scaling?")
        self.assertIn(response.status, {"not_stated", "insufficient_evidence"})
        self.assertEqual(response.answer, "not stated")

    def test_deep_question_returns_evidence_backed_response_without_gemini(self) -> None:
        service = build_service()
        paper = {"extracted_text_path": None}
        output = {
            "summary": "The paper proposes a dual-encoder retrieval architecture.",
            "sections": [
                {"title": "Introduction", "summary": "The paper targets retrieval efficiency."},
                {"title": "Method", "summary": "The model combines a dual-encoder with a reranker."},
            ],
            "key_insights": ["The architecture separates retrieval from reranking."],
            "novel_contributions": ["A hybrid retrieval pipeline."],
            "limitations": ["Performance drops on out-of-domain corpora."],
            "math_explanations": [
                {
                    "concept": "Scoring function",
                    "formula": "s(q, d) = q^T d",
                    "variable_notes": ["q is the query embedding", "d is the document embedding"],
                    "explanation": "Similarity is computed by inner product.",
                    "importance": "This ranking score drives first-stage retrieval.",
                }
            ],
            "implementation_steps": [],
            "sandbox_tasks": [],
            "starter_code": "print('ok')",
            "qa_ready": True,
        }
        response = service.answer_question(paper, output, "How does the architecture work and what limitation is reported?")
        self.assertIn(response.question_type, {"synthesis", "inference"})
        self.assertGreaterEqual(len(response.evidence), 2)
        self.assertTrue(bool(response.answer))

    def test_before_after_examples(self) -> None:
        service = build_service()
        paper = {"extracted_text_path": None}
        output = {
            "summary": "A paper about robust evaluation.",
            "sections": [
                {"title": "Experiments", "summary": "The method is tested on three noisy benchmarks."},
                {"title": "Future Work", "summary": "Future work includes robustness under distribution shift."},
            ],
            "key_insights": ["Robustness depends on calibration."],
            "novel_contributions": [],
            "limitations": ["The evaluation does not cover multilingual settings."],
            "math_explanations": [],
            "implementation_steps": [],
            "sandbox_tasks": [],
            "starter_code": "print('ok')",
            "qa_ready": True,
        }
        before_style_answer = output["summary"]
        after = service.answer_question(paper, output, "What limitation is reported and what future work follows from it?")
        self.assertEqual(before_style_answer, "A paper about robust evaluation.")
        self.assertIn(after.status, {"stated", "inferred"})
        self.assertGreaterEqual(len(after.evidence), 2)


if __name__ == "__main__":
    unittest.main()
