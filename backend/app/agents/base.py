from abc import ABC, abstractmethod

from app.services.gemini_service import GeminiService


class BaseAgent(ABC):
    def __init__(self, gemini_service: GeminiService):
        self.gemini_service = gemini_service

    @abstractmethod
    def run(self, paper_text: str, context: dict) -> dict:
        raise NotImplementedError
