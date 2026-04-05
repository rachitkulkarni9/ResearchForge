import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.ingestion_agent import IngestionAgent


class DummyGeminiService:
    client = None


class IngestionMetadataTests(unittest.TestCase):
    def test_metadata_lines_are_not_used_as_title(self) -> None:
        paper_text = """
Received: 18 July 2025
Revised: 18 July 2025
Accepted: 31 January 2026

Understanding Sparse Attention for Efficient Transformers

Abstract
This paper studies sparse attention.

Method
We define a sparse attention scoring rule.
"""
        result = IngestionAgent(DummyGeminiService()).run(paper_text, {})
        self.assertEqual(result["title"], "Understanding Sparse Attention for Efficient Transformers")

    def test_method_summary_skips_metadata(self) -> None:
        paper_text = """
Title

Method
Received: 18 July 2025
Revised: 18 July 2025
We compute attention scores with a sparse routing rule.
"""
        result = IngestionAgent(DummyGeminiService()).run(paper_text, {})
        self.assertEqual(result["chunks"]["method_summary"], "We compute attention scores with a sparse routing rule.")

    def test_wiley_style_collapsed_title_is_normalized(self) -> None:
        paper_text = """
Received:18July2025 Revised:18July2025 Accepted:31January2026
DOI:10.1002/aaai.70053
ARTICLE
MultimodalAIteacher:Integratingedgecomputingand
reasoningmodelsforenhancedstudenterroranalysis
TianlongXu1 Yi-FanZhang2 ZhendongChu1 QingsongWen1

Abstract
This paper studies a virtual AI teacher.
"""
        result = IngestionAgent(DummyGeminiService()).run(
            paper_text,
            {"filename": "AI Magazine - 2026 - Xu - Multimodal AI teacher  Integrating edge computing and reasoning models for enhanced student error.pdf"},
        )
        self.assertEqual(
            result["title"],
            "Multimodal AI teacher Integrating edge computing and reasoning models for enhanced student error",
        )


if __name__ == "__main__":
    unittest.main()
