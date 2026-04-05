import json
import logging
import os
from typing import Any

from google import genai
from google.genai import types
from google.auth import default as google_auth_default
from google.auth.exceptions import DefaultCredentialsError

from app.core.config import Settings
from app.schemas.paper import StructuredPaperOutput

logger = logging.getLogger(__name__)


class GeminiService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = self._build_client()

    def _configure_vertex_credentials(self) -> None:
        credentials_path = self.settings.google_application_credentials.strip()
        if credentials_path:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    def _has_vertex_credentials(self) -> bool:
        self._configure_vertex_credentials()
        try:
            google_auth_default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
            return True
        except DefaultCredentialsError as exc:
            logger.warning("Vertex AI credentials are unavailable: %s", exc)
            return False

    def _build_client(self):
        if self.settings.use_vertex_ai:
            if not self.settings.gcp_project_id or not self.settings.gcp_location:
                logger.warning("Vertex AI is enabled but GCP_PROJECT_ID or GCP_LOCATION is missing")
                return None
            if self._has_vertex_credentials():
                logger.info(
                    "Initializing Google Gen AI client in Vertex AI mode for project %s, location %s",
                    self.settings.gcp_project_id,
                    self.settings.gcp_location,
                )
                return genai.Client(
                    vertexai=True,
                    project=self.settings.gcp_project_id,
                    location=self.settings.gcp_location,
                )
            logger.warning(
                "Vertex AI is enabled but ADC is unavailable. Set GOOGLE_APPLICATION_CREDENTIALS or run application-default auth."
            )
            return None

        logger.warning("Vertex AI is disabled; AI client disabled")
        return None

    def is_resource_exhausted_error(self, error: Exception) -> bool:
        message = str(error).lower()
        return "resource_exhausted" in message or "429" in message or "credits are depleted" in message

    def is_ai_unavailable_error(self, error: Exception) -> bool:
        message = str(error).lower()
        return isinstance(error, DefaultCredentialsError) or (
            "default credentials" in message
            or "vertex ai client is not configured" in message
        )

    def should_fallback(self, error: Exception) -> bool:
        return self.is_resource_exhausted_error(error) or self.is_ai_unavailable_error(error)

    def generate_object(self, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("Vertex AI client is not configured")

        combined_prompt = self._build_json_prompt(prompt, schema)
        last_error: Exception | None = None

        for _ in range(3):
            try:
                response = self.client.models.generate_content(
                    model=self.settings.vertex_model,
                    contents=combined_prompt,
                )
                payload = (response.text or "").strip()
                return json.loads(payload)
            except Exception as exc:
                last_error = exc
                logger.warning("Vertex AI call failed, retrying: %s", exc)

        raise RuntimeError(f"Vertex AI response could not be validated: {last_error}")

    def generate_object_from_parts(self, parts: list[types.Part], schema: dict[str, Any]) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("Vertex AI client is not configured")

        prompt_part = types.Part.from_text(
            text=self._build_json_prompt(
                "Use every relevant text and image provided below. Ignore non-equation images and focus on equations, objectives, losses, and variable definitions.",
                schema,
            )
        )
        last_error: Exception | None = None

        for _ in range(3):
            try:
                response = self.client.models.generate_content(
                    model=self.settings.vertex_model,
                    contents=[types.Content(role="user", parts=[prompt_part, *parts])],
                )
                payload = (response.text or "").strip()
                return json.loads(payload)
            except Exception as exc:
                last_error = exc
                logger.warning("Vertex AI multimodal call failed, retrying: %s", exc)

        raise RuntimeError(f"Vertex AI multimodal response could not be validated: {last_error}")

    def generate_text(self, prompt: str) -> str:
        if not self.client:
            raise RuntimeError("Vertex AI client is not configured")
        response = self.client.models.generate_content(
            model=self.settings.vertex_model,
            contents=prompt,
        )
        return response.text or ""

    def _build_json_prompt(self, prompt: str, schema: dict[str, Any]) -> str:
        return (
            "Return valid JSON only. Do not wrap it in markdown.\n"
            f"Use this exact JSON shape:\n{json.dumps(schema, indent=2)}\n\n"
            f"{prompt}"
        )

    def build_fallback_output(self, reason: str) -> StructuredPaperOutput:
        return StructuredPaperOutput(
            summary="ResearchForge completed in fallback mode because Vertex AI was unavailable for live analysis.",
            sections=[
                {
                    "title": "Fallback mode",
                    "summary": "The paper was uploaded and processed structurally, but AI analysis used fallback content.",
                }
            ],
            key_insights=[
                "Vertex AI output was unavailable, so ResearchForge stored a safe fallback response.",
                "The upload, job orchestration, and sandbox flow are still operational.",
            ],
            novel_contributions=[
                "The system is resilient enough to keep the product usable during AI provider failures."
            ],
            limitations=[
                reason,
                "Restore Vertex AI authentication or quota to restore live paper analysis.",
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
                    "step": "Restore Vertex AI access",
                    "detail": "Update Vertex AI authentication or quota for the configured GCP project, then upload the paper again.",
                }
            ],
            sandbox_tasks=[
                {
                    "title": "Verify execution",
                    "objective": "Run the starter code to confirm the sandbox still works even in fallback mode.",
                }
            ],
            starter_code='print("ResearchForge sandbox ready")\n',
            qa_ready=True,
        )
