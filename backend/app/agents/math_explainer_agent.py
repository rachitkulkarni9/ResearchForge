from app.agents.base import BaseAgent


class MathExplainerAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        prompt = f"""
You are the Math Explainer Agent for PaperLab.
Explain the main math concepts in simple but technically correct terms.
Return the full required JSON shape.

Paper text:
{paper_text[:12000]}
"""
        return self.gemini_service.generate_json(prompt).model_dump()
