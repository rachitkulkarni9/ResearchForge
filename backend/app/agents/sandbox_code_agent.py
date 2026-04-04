from app.agents.base import BaseAgent


class SandboxCodeAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        prompt = f"""
You are the Sandbox Code Agent for PaperLab.
Generate concise runnable starter code and sandbox tasks inspired by the paper.
Return the full required JSON shape.

Paper text:
{paper_text[:12000]}
"""
        return self.gemini_service.generate_json(prompt).model_dump()
