import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.ingestion_agent import IngestionAgent


class DummyGeminiService:
    client = None


class IngestionAgentTests(unittest.TestCase):
    def build_agent(self) -> IngestionAgent:
        return IngestionAgent(DummyGeminiService())

    def test_preserves_sections_for_chunk_selection(self) -> None:
        paper_text = """
Title

Abstract
This paper studies a new optimizer.

Introduction
We motivate the problem.

Method
We minimize L = ||Ax - b||^2 + lambda ||x||_1.

Experiments
We compare against strong baselines.

Conclusion
The method is effective.
"""
        result = self.build_agent().run(paper_text, {})
        self.assertIn("Abstract", result["chunks"]["abstract"])
        self.assertIn("Introduction", result["chunks"]["introduction"])
        self.assertIn("Method", result["chunks"]["methods"])
        self.assertIn("Experiments", result["chunks"]["results"])
        self.assertIn("Conclusion", result["chunks"]["conclusion"])

    def test_collects_math_candidates_with_surrounding_context(self) -> None:
        paper_text = """
Method
We define the training objective below.
L = ||Ax - b||^2 + lambda ||x||_1
where x is the reconstruction and lambda controls sparsity.

We also optimize:
p(y|x) = softmax(Wx + b)
"""
        result = self.build_agent().run(paper_text, {})
        joined = "\n\n".join(result["math_candidates"])
        self.assertIn("L = ||Ax - b||^2 + lambda ||x||_1", joined)
        self.assertIn("where x is the reconstruction", joined)
        self.assertIn("p(y|x) = softmax(Wx + b)", joined)


if __name__ == "__main__":
    unittest.main()
