import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.implementation_agent import _build_simple_fallback_code, _is_bad_sandbox_code, _strip_markdown_fences


class ImplementationAgentTests(unittest.TestCase):
    def test_flags_obviously_off_topic_sandbox_code(self) -> None:
        code = """
--- Scenario 1: First time this error is encountered ---
[System] Cache Miss
[LLM] Analyzing student answer
"""
        self.assertTrue(_is_bad_sandbox_code(code))

    def test_builds_math_grounded_fallback_code(self) -> None:
        code = _build_simple_fallback_code(
            {
                "title": "Attention Is All You Need",
                "math_explanations": [
                    {
                        "concept": "Scaled dot-product attention",
                        "formula": "softmax(QK^T / sqrt(d_k))V",
                        "variable_notes": ["Q is query", "K is key", "V is value"],
                        "explanation": "Scale the dot products before softmax.",
                    }
                ],
                "chunks": {"methods": "We use scaled dot-product attention."},
            }
        )
        self.assertIn("Scaled dot-product attention", code)
        self.assertIn("def scaled_dot_product_attention", code)
        self.assertIn("attention weights", code)

    def test_builds_method_based_fallback_code(self) -> None:
        code = _build_simple_fallback_code(
            {
                "title": "Simple Sequence Model",
                "math_explanations": [],
                "chunks": {"method_summary": "Apply a weighted transformation over the input sequence."},
            }
        )
        self.assertIn("def run_method", code)
        self.assertIn("method output", code)

    def test_builds_error_pool_code_for_error_analysis_paper(self) -> None:
        code = _build_simple_fallback_code(
            {
                "title": "Multimodal AI teacher",
                "math_explanations": [],
                "chunks": {
                    "method_summary": "Maintain an error pool and analyze student drafts for error correction.",
                    "methods": "The system uses student drafts, dual-stream analysis, and an error pool cache.",
                },
            }
        )
        self.assertIn("error_pool = {}", code)
        self.assertIn("def analyze_error", code)
        self.assertIn("draft_analyzer", code)

    def test_strips_markdown_fences(self) -> None:
        code = _strip_markdown_fences("```python\nprint('hi')\n```")
        self.assertEqual(code, "print('hi')")


if __name__ == "__main__":
    unittest.main()
