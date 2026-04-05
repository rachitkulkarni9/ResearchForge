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
        sufficient_evidence = self.has_sufficient_evidence(retrieved, question_type)
        evidence_items = [EvidenceItem(source=item.source, passage=item.passage) for item in retrieved]

        if self.gemini_service.client:
            schema = {
                "status": "stated | inferred | hybrid | not_stated | insufficient_evidence",
                "question_type": "direct_fact | synthesis | inference | missing_info | hybrid_reasoning",
                "answer": "string",
                "confidence": 0.0,
            }
            evidence_block = "\n\n".join(
                f"Source: {item.source}\nPassage: {item.passage}" for item in retrieved
            ) or "No strong retrieved evidence was found."
            prompt = f"""
Answer the question with the retrieved paper evidence as the primary source.
When the evidence is incomplete, supplement with general domain knowledge and your own technical reasoning instead of stopping at "not stated".
Clearly label which parts come from the document and which parts come from your own reasoning.

Use this exact answer structure:
Document evidence:
<what the paper supports>

Reasoned extension:
<what you infer or supplement from general domain knowledge>

If the paper fully answers the question, keep the reasoned extension brief or say that the document already covers it.
Never dead-end on "not stated" unless the user literally asks whether something is stated.
If you supplement beyond the paper, set status to `hybrid` and question_type to `hybrid_reasoning`.
If the answer is mostly supported by the paper but still interpretive, use status `inferred`.
Confidence should reflect how much of the final answer is grounded in the paper:
- 0.75 to 0.95 when clearly stated in the document
- 0.5 to 0.74 when inferred mainly from the document
- 0.3 to 0.6 when a meaningful portion comes from general reasoning
- avoid 0.0 unless the system truly cannot answer at all

Retrieved evidence quality: {"strong" if sufficient_evidence else "limited"}
Original question type: {question_type}
Question: {question}

Evidence:
{evidence_block}
"""
            try:
                result = self.gemini_service.generate_object(prompt, schema)
                status = result.get("status", "hybrid" if not sufficient_evidence else "inferred")
                if status not in {"stated", "inferred", "hybrid", "not_stated", "insufficient_evidence"}:
                    status = "hybrid" if not sufficient_evidence else "inferred"
                resolved_question_type = result.get("question_type", question_type)
                if resolved_question_type not in {"direct_fact", "synthesis", "inference", "missing_info", "hybrid_reasoning"}:
                    resolved_question_type = "hybrid_reasoning" if status == "hybrid" else question_type
                if status == "hybrid":
                    resolved_question_type = "hybrid_reasoning"
                confidence = float(result.get("confidence", 0.5))
                confidence = max(0.0, min(confidence, 1.0))
                if status == "hybrid":
                    confidence = max(confidence, 0.35)
                answer = result.get("answer", self._build_fallback_answer(question_type, retrieved, sufficient_evidence))
                return AskQuestionResponse(
                    status=status,
                    question_type=resolved_question_type,
                    answer=answer,
                    evidence=evidence_items,
                    confidence=confidence,
                    citations=[item.source for item in evidence_items],
                )
            except Exception as exc:
                if not self.gemini_service.should_fallback(exc):
                    raise

        status = "hybrid" if not sufficient_evidence else ("inferred" if question_type in {"synthesis", "inference", "missing_info"} else "stated")
        resolved_question_type = "hybrid_reasoning" if status == "hybrid" else question_type
        answer = self._build_fallback_answer(question_type, retrieved, sufficient_evidence)
        return AskQuestionResponse(
            status=status,
            question_type=resolved_question_type,
            answer=answer,
            evidence=evidence_items,
            confidence=0.35 if status == "hybrid" else (0.45 if status == "inferred" else 0.55),
            citations=[item.source for item in evidence_items],
        )

    def _build_fallback_answer(self, question_type: str, retrieved: list[RetrievedChunk], sufficient_evidence: bool) -> str:
        if not retrieved:
            return (
                "Document evidence:\nThe retrieved paper context does not directly answer this question.\n\n"
                "Reasoned extension:\nA fuller answer would require either broader paper context or general domain reasoning, so the safest next step is to inspect the relevant section of the paper more closely."
            )
        if sufficient_evidence and question_type == "direct_fact":
            return (
                f"Document evidence:\n{retrieved[0].passage[:400]}\n\n"
                "Reasoned extension:\nThe paper appears to answer this directly, so little extra reasoning is needed."
            )

        joined = " ".join(chunk.passage[:220] for chunk in retrieved[:3])[:700]
        if sufficient_evidence:
            return (
                f"Document evidence:\n{joined}\n\n"
                "Reasoned extension:\nThis answer is synthesized from the retrieved paper evidence and may require some interpretation rather than a single verbatim sentence."
            )
        return (
            f"Document evidence:\n{joined}\n\n"
            "Reasoned extension:\nThe paper context is incomplete, so any stronger answer would need general domain reasoning beyond the retrieved passages."
        )
