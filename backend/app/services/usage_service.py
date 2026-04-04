from app.models.domain import UsageEventRecord
from app.services.document_store import DocumentStore


class UsageService:
    def __init__(self, document_store: DocumentStore):
        self.document_store = document_store

    def track(self, workspace_id: str, user_id: str, event_type: str, metadata: dict | None = None) -> None:
        event = UsageEventRecord(
            workspace_id=workspace_id,
            user_id=user_id,
            event_type=event_type,
            metadata=metadata or {},
        )
        self.document_store.upsert("usage_events", event.id, event.model_dump(mode="json"))
