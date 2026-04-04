import json
import math
import re
from dataclasses import dataclass
from typing import Iterable

from app.schemas.qa import AskQuestionResponse, EvidenceItem
from app.services.blob_store import BlobStore
from app.services.gemini_service import GeminiService


@dataclass
class RetrievedChunk:
    source: str
    passage: str
    score: float


class QAService:
    def __init__(self, blob_store: BlobStore, gemini_service: GeminiService):
        self.blob_store = blob_store
        self.gemini_service = gemini_service

    def classify_question(self, question: str) -> str:
        q = question.lower()
        if any(term in q for term in ["future work", "open problem", "not mention", "not stated", "missing", "unknown"]):
            return "missing_info"
        if any(term in q for term in ["why", "imply", "inferred", "suggest", "assume", "would", "could", "failure mode"]):
            return "inference"
        if any(term in q for term in ["compare", "tradeoff", "architecture", "how does", "limitations", "evaluation", "evidence", "support", "combine", "relationship"]):
            return "synthesis"
        return "direct_fact"

    def build_corpus(self, paper: dict, output: dict) -> list[tuple[str, str]]:
        corpus: list[tuple[str, str]] = []

        if output.get("summary"):
            corpus.append(("summary", output["summary"]))
        for section in output.get("sections", []):
            corpus.append((f"section:{section.get('title', 'section')}", section.get("summary", "")))
        for item in output.get("math_explanations", []):
            parts = [item.get("concept", "")]
            if item.get("formula"):
                parts.append(item["formula"])
            parts.extend(item.get("variable_notes", []))
            parts.append(item.get("explanation", ""))
            parts.append(item.get("importance", ""))
            corpus.append((f"math:{item.get('concept', 'formula')}", "\n".join(part for part in parts if part)))
        for index, step in enumerate(output.get("implementation_steps", []), start=1):
            corpus.append((f"implementation:{index}", f"{step.get('step', '')}\n{step.get('detail', '')}"))
        for index, insight in enumerate(output.get("key_insights", []), start=1):
            corpus.append((f"insight:{index}", insight))
        for index, item in enumerate(output.get("limitations", []), start=1):
            corpus.append((f"limitations:{index}", item))
        for index, item in enumerate(output.get("novel_contributions", []), start=1):
            corpus.append((f"contributions:{index}", item))

        extracted_path = paper.get("extracted_text_path")
        if extracted_path:
            extracted_text = self.blob_store.read_text(extracted_path)
            corpus.extend(self._chunk_extracted_text(extracted_text))

        return [(source, text) for source, text in corpus if text.strip()]

    def _chunk_extracted_text(self, text: str) -> list[tuple[str, str]]:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        chunks: list[tuple[str, str]] = []
        current_label = "body"
        index = 0
        for paragraph in paragraphs:
            lowered = paragraph.lower()
            if any(token in lowered[:80] for token in ["abstract", "introduction", "method", "approach", "experiment", "results", "conclusion", "future work", "discussion", "table", "figure"]):
                if len(paragraph.split()) <= 12:
                    current_label = paragraph[:80]
                    continue
            source = self._normalize_source_label(current_label, index)
            chunks.append((source, paragraph[:1800]))
            index += 1
        return chunks

    def _normalize_source_label(self, label: str, index: int) -> str:
        lowered = label.lower()
        if "abstract" in lowered:
            return f"abstract:{index}"
        if "introduction" in lowered:
            return f"introduction:{index}"
        if any(term in lowered for term in ["method", "approach", "model", "algorithm"]):
            return f"method:{index}"
        if any(term in lowered for term in ["experiment", "evaluation", "result", "table", "figure"]):
            return f"experiments:{index}"
        if any(term in lowered for term in ["conclusion", "future work", "discussion"]):
            return f"conclusion:{index}"
        return f"body:{index}"

    def retrieve(self, question: str, corpus: list[tuple[str, str]], question_type: str) -> list[RetrievedChunk]:
        query_terms = self._tokenize(question)
        chunks: list[RetrievedChunk] = []
        for source, passage in corpus:
            score = self._score_chunk(question, query_terms, source, passage)
            if score > 0:
                chunks.append(RetrievedChunk(source=source, passage=passage, score=score))
        chunks.sort(key=lambda item: item.score, reverse=True)
        limit = 2 if question_type == "direct_fact" else 5
        return chunks[:limit]

    def _score_chunk(self, question: str, query_terms: set[str], source: str, passage: str) -> float:
        text = f"{source} {passage}".lower()
        chunk_terms = self._tokenize(text)
        overlap = len(query_terms & chunk_terms)
        if overlap == 0:
            return 0.0
        score = overlap * 3.0

        preferences = {
            "abstract": ["abstract", "goal", "overview"],
            "introduction": ["motivation", "problem", "why"],
            "method": ["method", "architecture", "model", "objective", "formula"],
            "experiments": ["experiment", "evaluation", "result", "table", "figure", "ablation"],
            "conclusion": ["conclusion", "future", "limitation", "discussion"],
        }
        for section, keywords in preferences.items():
            if source.startswith(section) and any(keyword in question.lower() for keyword in keywords):
                score += 2.0
        score += min(len(passage) / 800.0, 1.5)
        return score

    def _tokenize(self, text: str) -> set[str]:
        tokens = re.findall(r"[a-zA-Z0-9_]+", text.lower())
        stopwords = {
            "the", "is", "a", "an", "of", "to", "and", "in", "for", "on", "with", "what", "how",
            "does", "do", "did", "this", "that", "it", "are", "be", "by", "from", "as", "at", "or",
        }
        return {token for token in tokens if token not in stopwords and len(token) > 2}

    def has_sufficient_evidence(self, retrieved: list[RetrievedChunk], question_type: str) -> bool:
        if not retrieved:
            return False
        threshold = 3.5 if question_type == "direct_fact" else 5.0
        return sum(chunk.score for chunk in retrieved[:2]) >= threshold

    def answer_question(self, paper: dict, output: dict, question: str) -> AskQuestionResponse:
        question_type = self.classify_question(question)
        corpus = self.build_corpus(paper, output)
        retrieved = self.retrieve(question, corpus, question_type)

        if not self.has_sufficient_evidence(retrieved, question_type):
            return AskQuestionResponse(
                status="insufficient_evidence",
                question_type=question_type,
                answer="not stated",
                evidence=[EvidenceItem(source=item.source, passage=item.passage) for item in retrieved[:2]],
                confidence=0.15,
                citations=[item.source for item in retrieved[:2]],
            )

        evidence_items = [EvidenceItem(source=item.source, passage=item.passage) for item in retrieved]

        if self.gemini_service.client:
            schema = {
                "status": "stated | inferred | not_stated | insufficient_evidence",
                "answer": "string",
                "confidence": 0.0,
            }
            evidence_block = "\n\n".join(
                f"Source: {item.source}\nPassage: {item.passage}" for item in retrieved
            )
            prompt = f"""
Answer the question using only the evidence below.
Do not guess.
If the exact answer is not explicitly stated in the evidence, use status `not_stated` or `inferred`.
For deep questions, synthesize across multiple passages when needed.
Prefer evidence from abstract, introduction, method, figures, tables, experiments, conclusion, and future work.
Keep the answer concise but specific.

Question type: {question_type}
Question: {question}

Evidence:
{evidence_block}
"""
            try:
                result = self.gemini_service.generate_object(prompt, schema)
                status = result.get("status", "insufficient_evidence")
                if status not in {"stated", "inferred", "not_stated", "insufficient_evidence"}:
                    status = "insufficient_evidence"
                confidence = float(result.get("confidence", 0.5))
                confidence = max(0.0, min(confidence, 1.0))
                answer = result.get("answer", "not stated")
                return AskQuestionResponse(
                    status=status,
                    question_type=question_type,
                    answer=answer,
                    evidence=evidence_items,
                    confidence=confidence,
                    citations=[item.source for item in evidence_items],
                )
            except Exception as exc:
                if not self.gemini_service.is_resource_exhausted_error(exc):
                    raise

        status = "inferred" if question_type in {"synthesis", "inference"} else "stated"
        answer = self._build_fallback_answer(question_type, retrieved)
        return AskQuestionResponse(
            status=status,
            question_type=question_type,
            answer=answer,
            evidence=evidence_items,
            confidence=0.45 if status == "inferred" else 0.55,
            citations=[item.source for item in evidence_items],
        )

    def _build_fallback_answer(self, question_type: str, retrieved: list[RetrievedChunk]) -> str:
        if not retrieved:
            return "not stated"
        if question_type == "direct_fact":
            return retrieved[0].passage[:400]
        joined = " ".join(chunk.passage[:220] for chunk in retrieved[:3])
        return joined[:700]
