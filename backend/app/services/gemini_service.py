import json
import logging
from typing import Any

from google import genai

from app.core.config import Settings
from app.schemas.paper import StructuredPaperOutput

logger = logging.getLogger(__name__)


class GeminiService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = self._build_client()

    def _build_client(self):
        if self.settings.use_vertex_ai:
            if not self.settings.gcp_project_id or not self.settings.gcp_location:
                logger.warning("Vertex AI is enabled but GCP_PROJECT_ID or GCP_LOCATION is missing")
                return None
            logger.info("Initializing Google Gen AI client in Vertex AI mode for project %s, location %s", self.settings.gcp_project_id, self.settings.gcp_location)
            return genai.Client(
                vertexai=True,
                project=self.settings.gcp_project_id,
                location=self.settings.gcp_location,
            )

        if self.settings.gemini_api_key:
            logger.info("Initializing Google Gen AI client in Gemini API key mode")
            return genai.Client(api_key=self.settings.gemini_api_key)

        logger.warning("No Gemini or Vertex AI configuration found; AI client disabled")
        return None

    def is_resource_exhausted_error(self, error: Exception) -> bool:
        message = str(error).lower()
        return "resource_exhausted" in message or "429" in message or "credits are depleted" in message

    def generate_object(self, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("Gemini client is not configured")

        combined_prompt = (
            "Return valid JSON only. Do not wrap it in markdown.\n"
            f"Use this exact JSON shape:\n{json.dumps(schema, indent=2)}\n\n"
            f"{prompt}"
        )
        last_error: Exception | None = None

        for _ in range(3):
            try:
                response = self.client.models.generate_content(
                    model=self.settings.gemini_model,
                    contents=combined_prompt,
                )
                payload = (response.text or "").strip()
                return json.loads(payload)
            except Exception as exc:
                last_error = exc
                logger.warning("Gemini call failed, retrying: %s", exc)

        raise RuntimeError(f"Gemini response could not be validated: {last_error}")

    def generate_text(self, prompt: str) -> str:
        if not self.client:
            raise RuntimeError("Gemini client is not configured")
        response = self.client.models.generate_content(
            model=self.settings.gemini_model,
            contents=prompt,
        )
        return response.text or ""

    def build_fallback_output(self, reason: str) -> StructuredPaperOutput:
        return StructuredPaperOutput(
            summary="PaperLab completed in fallback mode because Gemini was unavailable for live analysis.",
            sections=[
                {
                    "title": "Fallback mode",
                    "summary": "The paper was uploaded and processed structurally, but AI analysis used fallback content.",
                }
            ],
            key_insights=[
                "Gemini output was unavailable, so PaperLab stored a safe fallback response.",
                "The upload, job orchestration, and sandbox flow are still operational.",
            ],
            novel_contributions=[
                "The system is resilient enough to keep the product usable during AI provider failures."
            ],
            limitations=[
                reason,
                "Add credits or fix Gemini billing to restore live paper analysis.",
            ],
            math_explanations=[
                {
                    "concept": "Fallback mode",
                    "formula": "",
                    "variable_notes": [],
                    "explanation": "No live mathematical explanation is available because the AI provider rejected the request.",
                    "importance": "Math extraction is unavailable in fallback mode.",
                }
            ],
            implementation_steps=[
                {
                    "step": "Restore Gemini access",
                    "detail": "Update billing or API quota for the configured Gemini project, then upload the paper again.",
                }
            ],
            sandbox_tasks=[
                {
                    "title": "Verify execution",
                    "objective": "Run the starter code to confirm the sandbox still works even in fallback mode.",
                }
            ],
            starter_code='print("PaperLab sandbox ready")\n',
            qa_ready=True,
        )
