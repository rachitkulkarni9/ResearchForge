from app.agents.base import BaseAgent


class TutorAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        question = context["question"]
        if not self.gemini_service.client:
            return {
                "answer": "Vertex AI is not configured yet. Set GOOGLE_APPLICATION_CREDENTIALS or local ADC to enable paper Q&A.",
                "citations": [],
            }

        prompt = f"""
You are the Tutor Agent for PaperLab.
Answer the user's question based on the processed paper content below.
Be concise and practical.

Question:
{question}

Paper content:
{paper_text[:12000]}
"""
        return {"answer": self.gemini_service.generate_text(prompt), "citations": []}
