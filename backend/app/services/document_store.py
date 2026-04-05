import json
from pathlib import Path
from typing import Any

from google.cloud import firestore

from app.core.config import Settings


class DocumentStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.local_root = Path(settings.local_data_dir) / "firestore"
        self.local_root.mkdir(parents=True, exist_ok=True)
        self._client = None

        if settings.gcp_project_id and not settings.allow_local_store_fallback:
            self._client = firestore.Client(
                project=settings.gcp_project_id,
                database=settings.firestore_database,
            )

    def _collection_dir(self, name: str) -> Path:
        path = self.local_root / name
        path.mkdir(parents=True, exist_ok=True)
        return path

    def upsert(self, collection: str, doc_id: str, payload: dict[str, Any]) -> None:
        if self._client:
            self._client.collection(collection).document(doc_id).set(payload)
            return
        with (self._collection_dir(collection) / f"{doc_id}.json").open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, default=str, indent=2)

    def get(self, collection: str, doc_id: str) -> dict[str, Any] | None:
        if self._client:
            snapshot = self._client.collection(collection).document(doc_id).get()
            return snapshot.to_dict() if snapshot.exists else None
        path = self._collection_dir(collection) / f"{doc_id}.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def list(self, collection: str, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        filters = filters or {}
        if self._client:
            query = self._client.collection(collection)
            for key, value in filters.items():
                query = query.where(key, "==", value)
            return [item.to_dict() for item in query.stream()]

        items: list[dict[str, Any]] = []
        for path in self._collection_dir(collection).glob("*.json"):
            item = json.loads(path.read_text(encoding="utf-8"))
            if all(item.get(key) == value for key, value in filters.items()):
                items.append(item)
        items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return items

    def delete(self, collection: str, doc_id: str) -> None:
        if self._client:
            self._client.collection(collection).document(doc_id).delete()
            return
        path = self._collection_dir(collection) / f"{doc_id}.json"
        if path.exists():
            path.unlink()
