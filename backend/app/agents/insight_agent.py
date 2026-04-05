from google.genai import types

from app.agents.base import BaseAgent


INSIGHT_MATH_SCHEMA = {
    "key_insights": ["string"],
    "novel_contributions": ["string"],
    "limitations": ["string"],
    "math_explanations": [
        {
            "concept": "string",
            "formula": "string",
            "variable_notes": ["string"],
            "explanation": "string",
            "importance": "string",
            "source_type": "text | image | hybrid",
            "source_context": "string",
        }
    ],
}


class InsightAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        math_candidates = "\n".join(context.get("math_candidates", [])[:25])
        prompt = f"""
You are the Insight and Math Agent for PaperLab.
Extract the main insights, novel contributions, limitations, and every important mathematical item from the paper.

For the math portion:
- capture losses, objectives, update rules, scoring functions, probability definitions, constraints, and core equations
- when exact formula text is visible, put it in the `formula` field
- explain each symbol or variable in `variable_notes`
- explain what the formula does in `explanation`
- explain why it matters in `importance`
- return as many important formulas as the paper contains, not just one or two
- if the PDF text is imperfect, reconstruct the most faithful readable formula you can from context
- set `source_type` to `image` when the formula is primarily recovered from an equation image, `text` when it is text-based, and `hybrid` when both helped
- set `source_context` to a short note like "page 4 equation image" or "methods text"

Only return the fields requested by the schema.

Methods:
{context['chunks']['methods']}

Results:
{context['chunks']['results']}

Conclusion:
{context['chunks']['conclusion']}

Math-like lines extracted from the paper text:
{math_candidates or context['chunks'].get('math_context', '')}
"""
        equation_image_candidates = context.get("equation_image_candidates", [])
        if equation_image_candidates:
            parts = [types.Part.from_text(text=prompt)]
            for item in equation_image_candidates[:6]:
                parts.append(
                    types.Part.from_text(
                        text=(
                            f"Equation image candidate from page {item['page']}, image {item['index'] + 1}, "
                            f"dimensions {item.get('width') or '?'}x{item.get('height') or '?'}."
                        )
                    )
                )
                parts.append(types.Part.from_bytes(data=item["data"], mime_type=item["mime_type"]))
            return self.gemini_service.generate_object_from_parts(parts, INSIGHT_MATH_SCHEMA)

        return self.gemini_service.generate_object(prompt, INSIGHT_MATH_SCHEMA)
