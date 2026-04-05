from pathlib import Path

from google.cloud import storage

from app.core.config import Settings


class BlobStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.local_root = Path(settings.local_data_dir) / "gcs"
        self.local_root.mkdir(parents=True, exist_ok=True)
        self._client = None
        if settings.gcp_project_id and not settings.allow_local_store_fallback:
            self._client = storage.Client(project=settings.gcp_project_id)

    def upload_bytes(self, bucket_name: str, blob_name: str, content: bytes, content_type: str) -> str:
        if self._client and bucket_name:
            bucket = self._client.bucket(bucket_name)
            blob = bucket.blob(blob_name)
            blob.upload_from_string(content, content_type=content_type)
            return f"gs://{bucket_name}/{blob_name}"

        local_path = self.local_root / bucket_name / blob_name
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(content)
        return str(local_path)

    def upload_text(self, bucket_name: str, blob_name: str, content: str) -> str:
        return self.upload_bytes(bucket_name, blob_name, content.encode("utf-8"), "text/plain")

    def read_bytes(self, path: str) -> bytes:
        if path.startswith("gs://") and self._client:
            _, remainder = path.split("gs://", 1)
            bucket_name, blob_name = remainder.split("/", 1)
            bucket = self._client.bucket(bucket_name)
            return bucket.blob(blob_name).download_as_bytes()
        return Path(path).read_bytes()

    def read_text(self, path: str) -> str:
        return self.read_bytes(path).decode("utf-8", errors="ignore")

    def delete_path(self, path: str) -> None:
        if not path:
            return
        if path.startswith("gs://") and self._client:
            _, remainder = path.split("gs://", 1)
            bucket_name, blob_name = remainder.split("/", 1)
            bucket = self._client.bucket(bucket_name)
            bucket.blob(blob_name).delete()
            return
        local_path = Path(path)
        if local_path.exists():
            local_path.unlink()
