import re

from app.agents.base import BaseAgent


MATH_PATTERN = re.compile(
    r"(=|\\|\bmin\b|\bmax\b|\bargmax\b|\bargmin\b|\bloss\b|\bobjective\b|\btheorem\b|\blemma\b|\bproof\b|\bgradient\b|\bprobability\b|\bvariance\b|\bexpectation\b|\bsoftmax\b|\bkl\b|\bdivergence\b|\bentropy\b|\balpha\b|\bbeta\b|\blambda\b|\bmu\b|\bsigma\b|\blog\b|\bexp\b|\bcos\b|\bsin\b|\btanh\b|\bnorm\b|\bsubject to\b)",
    re.IGNORECASE,
)
SECTION_SPLIT_PATTERN = re.compile(r"\n\s*\n+")
METADATA_LINE_PATTERN = re.compile(
    r"^(received|revised|accepted|published|available online|doi|copyright|corresponding author|recommended for publication)\b",
    re.IGNORECASE,
)
AUTHOR_LINE_PATTERN = re.compile(r"^[A-Z][A-Za-z\-']+\w*\d+(?:\s+[A-Z][A-Za-z\-']+\w*\d+)+$")


def _looks_math_like(line: str) -> bool:
    compact = line.strip()
    if len(compact) < 6:
        return False
    if MATH_PATTERN.search(compact):
        return True

    symbol_count = sum(compact.count(symbol) for symbol in ["=", "+", "-", "*", "/", "^", "_", "(", ")", "[", "]", "{", "}"])
    digit_count = sum(char.isdigit() for char in compact)
    uppercase_vars = len(re.findall(r"\b[A-Z][A-Z0-9_]*\b", compact))

    if symbol_count >= 2 and digit_count >= 1:
        return True
    if "=" in compact and re.search(r"[A-Za-z]", compact):
        return True
    if uppercase_vars >= 2 and any(token in compact for token in ["=", "^", "_"]):
        return True
    if re.search(r"\b[xyzwuv]\b", compact, re.IGNORECASE) and re.search(r"[\^_=]", compact):
        return True
    return False


def _collect_math_candidates(lines: list[str], limit: int = 40) -> list[str]:
    math_candidates: list[str] = []
    seen: set[str] = set()
    last_end = -1

    for index, line in enumerate(lines):
        compact = line.strip()
        if not _looks_math_like(compact):
            continue
        if index <= last_end:
            continue

        start = max(0, index - 1)
        end = min(len(lines), index + 2)
        window = [entry.strip() for entry in lines[start:end] if entry.strip()]
        if not window:
            continue
        candidate = "\n".join(window)
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        math_candidates.append(candidate)
        last_end = end - 1
        if len(math_candidates) >= limit:
            break

    return math_candidates


def _looks_like_metadata_line(line: str) -> bool:
    compact = " ".join(line.strip().split())
    if not compact:
        return True
    if METADATA_LINE_PATTERN.match(compact):
        return True
    if compact.lower().startswith("keywords"):
        return True
    if re.search(r"\b(received|revised|accepted)\s*:\s*\d", compact, re.IGNORECASE):
        return True
    return False


def _looks_like_author_line(line: str) -> bool:
    compact = " ".join(line.strip().split())
    if not compact:
        return False
    if AUTHOR_LINE_PATTERN.match(compact):
        return True
    if compact.lower().startswith("correspondence"):
        return True
    if "@" in compact:
        return True
    return False


def _normalize_collapsed_title_text(text: str) -> str:
    normalized = " ".join(text.strip().split())
    normalized = re.sub(r"([a-z])([A-Z])", r"\1 \2", normalized)
    normalized = re.sub(r"([A-Z]{2,})([A-Z][a-z])", r"\1 \2", normalized)
    normalized = re.sub(r"([a-zA-Z])(:)([A-Za-z])", r"\1\2 \3", normalized)
    normalized = re.sub(r"([a-z])(\d)", r"\1 \2", normalized)
    normalized = re.sub(r"(\d)([A-Za-z])", r"\1 \2", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip(" -,:;")


def _looks_like_title_fragment(line: str) -> bool:
    compact = line.strip()
    if not compact:
        return False
    if compact.endswith("."):
        return False
    if len(compact.split()) > 12:
        return False
    return True


def _title_quality_score(title: str) -> tuple[int, int]:
    words = title.split()
    long_words = sum(1 for word in words if len(word) >= 14)
    return (len(words), -long_words)


def _title_from_filename(filename: str | None) -> str | None:
    if not filename:
        return None
    stem = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE).strip()
    parts = [part.strip() for part in stem.split(" - ") if part.strip()]
    candidate = parts[-1] if parts else stem
    candidate = re.sub(r"\s+", " ", candidate).strip(" -_:;")
    return candidate or None


def _pick_title(sections: list[str], filename: str | None = None) -> str:
    title_lines: list[str] = []
    for section in sections[:4]:
        for line in section.splitlines()[:8]:
            compact = " ".join(line.strip().split())
            if not compact or _looks_like_metadata_line(compact):
                continue
            if compact.lower() in {"abstract", "introduction"}:
                if title_lines:
                    break
                continue
            if _looks_like_author_line(compact):
                if title_lines:
                    joined = _normalize_collapsed_title_text(" ".join(title_lines))
                    if len(joined) >= 12:
                        pdf_title = joined[:200]
                        file_title = _title_from_filename(filename)
                        if file_title and _title_quality_score(file_title) > _title_quality_score(pdf_title):
                            return file_title[:200]
                        return pdf_title
                break
            if compact.upper() == compact and len(compact.split()) <= 2:
                continue
            if title_lines and not _looks_like_title_fragment(compact):
                break
            title_lines.append(compact)
            if len(title_lines) >= 3:
                joined = _normalize_collapsed_title_text(" ".join(title_lines))
                if len(joined) >= 12:
                    pdf_title = joined[:200]
                    file_title = _title_from_filename(filename)
                    if file_title and _title_quality_score(file_title) > _title_quality_score(pdf_title):
                        return file_title[:200]
                    return pdf_title

    candidate_lines = [_normalize_collapsed_title_text(line) for line in title_lines]
    for line in candidate_lines:
        if 12 <= len(line) <= 180 and len(line.split()) >= 3:
            file_title = _title_from_filename(filename)
            if file_title and _title_quality_score(file_title) > _title_quality_score(line):
                return file_title[:200]
            return line

    file_title = _title_from_filename(filename)
    if file_title:
        return file_title[:200]
    return candidate_lines[0][:200] if candidate_lines else "Untitled paper"


def _clean_summary_line(text: str, fallback: str) -> str:
    for line in text.splitlines():
        compact = " ".join(line.strip().split())
        if not compact or _looks_like_metadata_line(compact):
            continue
        if len(compact) < 12:
            continue
        return compact[:160]
    return fallback


class IngestionAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        lines = [line.rstrip() for line in paper_text.splitlines()]
        normalized = "\n".join(lines)
        dense_text = "\n".join(line.strip() for line in lines if line.strip())
        truncated = normalized[:50000]
        sections = [chunk.strip() for chunk in SECTION_SPLIT_PATTERN.split(truncated) if chunk.strip()]

        title = _pick_title(sections, context.get("filename"))
        abstract_chunk = next((section for section in sections if "abstract" in section.lower()), truncated[:5000])
        intro_chunk = next((section for section in sections if "introduction" in section.lower()), truncated[:5000])
        methods_chunk = next(
            (
                section
                for section in sections
                if any(keyword in section.lower() for keyword in ["method", "approach", "model", "algorithm", "objective", "training"])
            ),
            truncated[4000:16000] or truncated[:5000],
        )
        results_chunk = next(
            (
                section
                for section in sections
                if any(keyword in section.lower() for keyword in ["experiment", "result", "evaluation", "ablation"])
            ),
            truncated[16000:28000] or truncated[:5000],
        )
        conclusion_chunk = next(
            (
                section
                for section in sections
                if any(keyword in section.lower() for keyword in ["conclusion", "discussion", "future work"])
            ),
            truncated[-5000:],
        )

        math_candidates = _collect_math_candidates(lines)
        math_context = "\n\n".join(math_candidates)

        return {
            "title": title,
            "clean_text": dense_text[:50000],
            "character_count": len(dense_text),
            "chunks": {
                "abstract": abstract_chunk[:5000],
                "introduction": intro_chunk[:5000],
                "methods": methods_chunk[:9000],
                "results": results_chunk[:7000],
                "conclusion": conclusion_chunk[:5000],
                "math_context": math_context[:6000],
                "method_summary": _clean_summary_line(methods_chunk, "Core method from the paper"),
            },
            "math_candidates": math_candidates,
            "equation_image_candidates": context.get("equation_image_candidates", []),
        }
