import re

from app.agents.base import BaseAgent


MATH_PATTERN = re.compile(
    r"(=|\\|\bmin\b|\bmax\b|\bargmax\b|\bargmin\b|\bloss\b|\bobjective\b|\btheorem\b|\blemma\b|\bproof\b|\bgradient\b|\bprobability\b|\bvariance\b|\bexpectation\b|\bsoftmax\b|\bkl\b|\bdivergence\b|\bentropy\b|\balpha\b|\bbeta\b|\blambda\b|\bmu\b|\bsigma\b)",
    re.IGNORECASE,
)


class IngestionAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        cleaned = "\n".join(line.strip() for line in paper_text.splitlines() if line.strip())
        normalized = cleaned[:50000]
        sections = [chunk.strip() for chunk in normalized.split("\n\n") if chunk.strip()]

        title = sections[0].split("\n", 1)[0][:200] if sections else "Untitled paper"
        abstract_chunk = next((section for section in sections if "abstract" in section.lower()), normalized[:5000])
        intro_chunk = next((section for section in sections if "introduction" in section.lower()), normalized[:5000])
        methods_chunk = next(
            (
                section
                for section in sections
                if any(keyword in section.lower() for keyword in ["method", "approach", "model", "algorithm", "objective", "training"])
            ),
            normalized[4000:16000] or normalized[:5000],
        )
        results_chunk = next(
            (
                section
                for section in sections
                if any(keyword in section.lower() for keyword in ["experiment", "result", "evaluation", "ablation"])
            ),
            normalized[16000:28000] or normalized[:5000],
        )
        conclusion_chunk = next(
            (
                section
                for section in sections
                if any(keyword in section.lower() for keyword in ["conclusion", "discussion", "future work"])
            ),
            normalized[-5000:],
        )

        candidate_lines: list[str] = []
        for line in normalized.splitlines():
            compact = line.strip()
            if len(compact) < 6:
                continue
            if MATH_PATTERN.search(compact):
                candidate_lines.append(compact)

        math_candidates: list[str] = []
        seen: set[str] = set()
        for line in candidate_lines:
            key = line.lower()
            if key in seen:
                continue
            seen.add(key)
            math_candidates.append(line)
            if len(math_candidates) >= 40:
                break

        math_context = "\n".join(math_candidates)

        return {
            "title": title,
            "clean_text": normalized,
            "character_count": len(cleaned),
            "chunks": {
                "abstract": abstract_chunk[:5000],
                "introduction": intro_chunk[:5000],
                "methods": methods_chunk[:9000],
                "results": results_chunk[:7000],
                "conclusion": conclusion_chunk[:5000],
                "math_context": math_context[:6000],
            },
            "math_candidates": math_candidates,
        }
