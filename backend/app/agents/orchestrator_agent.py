from app.agents.base import BaseAgent
from app.schemas.paper import StructuredPaperOutput


class OrchestratorAgent(BaseAgent):
    def run(self, paper_text: str, context: dict) -> dict:
        summary = context["summary"]
        insights = context["insights"]
        implementation = context["implementation"]

        merged = StructuredPaperOutput(
            summary=summary.get("summary", "Paper summary unavailable."),
            sections=summary.get("sections", []),
            key_insights=insights.get("key_insights", []),
            novel_contributions=insights.get("novel_contributions", []),
            limitations=insights.get("limitations", []),
            math_explanations=insights.get("math_explanations", []),
            implementation_steps=implementation.get("implementation_steps", []),
            sandbox_tasks=implementation.get("sandbox_tasks", []),
            starter_code=implementation.get("starter_code") or 'print("PaperLab sandbox ready")\n',
            qa_ready=True,
        )
        return merged.model_dump(mode="json")
