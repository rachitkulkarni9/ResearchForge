from app.agents.base import BaseAgent


class TutorAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        question = context["question"]
        if not self.gemini_service.client:
            return {"answer": "Gemini is not configured yet. Add GEMINI_API_KEY to enable paper Q&A.", "citations": []}

        prompt = f"""
You are the Tutor Agent for PaperLab.
Answer the user's question based on the processed paper content below.
Be concise and practical.

Question:
{question}

Paper content:
{paper_text[:12000]}
"""
        response = self.gemini_service.client.models.generate_content(
            model=self.gemini_service.settings.gemini_model,
            contents=prompt,
        )
        return {"answer": response.text or "", "citations": []}
