from app.agents.base import BaseAgent


SUMMARY_SCHEMA = {
    "summary": "string",
    "sections": [{"title": "string", "summary": "string"}],
}


class SummaryAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        prompt = f"""
You are the Summary Agent for PaperLab.
Write a concise high-quality paper summary and section breakdown.
Only return the fields requested by the schema.

Paper title:
{context.get('title', 'Untitled paper')}

Abstract:
{context['chunks']['abstract']}

Introduction:
{context['chunks']['introduction']}

Conclusion:
{context['chunks']['conclusion']}
"""
        return self.gemini_service.generate_object(prompt, SUMMARY_SCHEMA)
