from app.agents.base import BaseAgent


IMPLEMENTATION_SCHEMA = {
    "implementation_steps": [{"step": "string", "detail": "string"}],
    "sandbox_tasks": [{"title": "string", "objective": "string"}],
    "starter_code": "string",
}


class ImplementationAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        prompt = f"""
You are the Implementation and Sandbox Agent for PaperLab.
Translate the paper into practical implementation steps and a concise runnable Python starter.
Only return the fields requested by the schema.
The starter code should be simple, executable, and educational.

Paper title:
{context.get('title', 'Untitled paper')}

Methods:
{context['chunks']['methods']}

Results:
{context['chunks']['results']}
"""
        return self.gemini_service.generate_object(prompt, IMPLEMENTATION_SCHEMA)
