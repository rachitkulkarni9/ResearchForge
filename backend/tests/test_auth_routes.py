import shutil
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app
from app.services.blob_store import BlobStore
from app.services.document_store import DocumentStore
from app.services.usage_service import UsageService
from app.services.workspace_service import WorkspaceService
from app.utils.dependencies import get_blob_store, get_document_store, get_firebase_auth_service, get_usage_service, get_workspace_service


class DummyFirebaseAuthService:
    def verify_id_token(self, token: str) -> dict:
        if token != "firebase-test-token":
            raise ValueError("invalid token")
        return {
            "uid": "firebase-user-1",
            "email": "firebase@example.com",
            "name": "Firebase User",
        }


class AuthRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.test_root = Path(".paperlab_auth_test_data")
        shutil.rmtree(self.test_root, ignore_errors=True)
        self.settings = Settings(
            local_data_dir=str(self.test_root),
            allow_local_store_fallback=True,
            jwt_secret="test-secret",
            session_cookie_name="paperlab_session",
        )
        self.document_store = DocumentStore(self.settings)
        self.blob_store = BlobStore(self.settings)
        self.workspace_service = WorkspaceService(self.document_store)
        self.usage_service = UsageService(self.document_store)
        app.dependency_overrides[get_settings] = lambda: self.settings
        app.dependency_overrides[get_document_store] = lambda: self.document_store
        app.dependency_overrides[get_blob_store] = lambda: self.blob_store
        app.dependency_overrides[get_firebase_auth_service] = lambda: DummyFirebaseAuthService()
        app.dependency_overrides[get_workspace_service] = lambda: self.workspace_service
        app.dependency_overrides[get_usage_service] = lambda: self.usage_service
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        shutil.rmtree(self.test_root, ignore_errors=True)

    def test_signup_sets_session_cookie_and_returns_session(self) -> None:
        response = self.client.post(
            "/auth/signup",
            json={"email": "ada@example.com", "name": "Ada", "password": "supersecret"},
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("paperlab_session", response.cookies)
        data = response.json()
        self.assertEqual(data["user"]["email"], "ada@example.com")
        self.assertEqual(data["token_type"], "session")

        session_response = self.client.get("/auth/session")
        self.assertEqual(session_response.status_code, 200)
        self.assertEqual(session_response.json()["user"]["name"], "Ada")

    def test_login_and_logout_flow(self) -> None:
        signup_response = self.client.post(
            "/auth/signup",
            json={"email": "grace@example.com", "name": "Grace", "password": "supersecret"},
        )
        self.assertEqual(signup_response.status_code, 201)

        logout_response = self.client.post("/auth/logout")
        self.assertEqual(logout_response.status_code, 200)

        unauthorized_response = self.client.get("/auth/session")
        self.assertEqual(unauthorized_response.status_code, 401)

        login_response = self.client.post(
            "/auth/login",
            json={"email": "grace@example.com", "password": "supersecret"},
        )
        self.assertEqual(login_response.status_code, 200)

        session_response = self.client.get("/auth/session")
        self.assertEqual(session_response.status_code, 200)
        self.assertEqual(session_response.json()["user"]["email"], "grace@example.com")

    def test_login_rejects_invalid_password(self) -> None:
        self.client.post(
            "/auth/signup",
            json={"email": "linus@example.com", "name": "Linus", "password": "supersecret"},
        )
        self.client.post("/auth/logout")

        response = self.client.post(
            "/auth/login",
            json={"email": "linus@example.com", "password": "wrongpass"},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Invalid email or password")

    def test_signup_upgrades_legacy_user_without_password(self) -> None:
        self.document_store.upsert(
            "workspaces",
            "workspace-1",
            {"id": "workspace-1", "name": "Legacy Workspace", "owner_user_id": "user-1", "plan": "hackathon"},
        )
        self.document_store.upsert(
            "users",
            "user-1",
            {
                "id": "user-1",
                "email": "legacy@example.com",
                "name": "Legacy User",
                "default_workspace_id": "workspace-1",
            },
        )

        response = self.client.post(
            "/auth/signup",
            json={"email": "legacy@example.com", "name": "Updated Legacy", "password": "supersecret"},
        )

        self.assertEqual(response.status_code, 201)
        login_response = self.client.post(
            "/auth/login",
            json={"email": "legacy@example.com", "password": "supersecret"},
        )
        self.assertEqual(login_response.status_code, 200)

    def test_delete_paper_removes_related_records_and_files(self) -> None:
        signup_response = self.client.post(
            "/auth/signup",
            json={"email": "delete@example.com", "name": "Delete User", "password": "supersecret"},
        )
        workspace_id = signup_response.json()["workspace"]["id"]
        user_id = signup_response.json()["user"]["id"]

        pdf_path = self.test_root / "paper.pdf"
        text_path = self.test_root / "paper.txt"
        pdf_path.write_bytes(b"pdf")
        text_path.write_text("text", encoding="utf-8")

        self.document_store.upsert(
            "papers",
            "paper-1",
            {
                "id": "paper-1",
                "workspace_id": workspace_id,
                "uploaded_by": user_id,
                "title": "Delete Me",
                "filename": "delete-me.pdf",
                "pdf_gcs_path": str(pdf_path),
                "content_hash": "hash",
                "extracted_text_path": str(text_path),
                "status": "completed",
            },
        )
        self.document_store.upsert(
            "jobs",
            "job-1",
            {"id": "job-1", "workspace_id": workspace_id, "paper_id": "paper-1", "status": "completed"},
        )
        self.document_store.upsert(
            "paper_outputs",
            "paper-1",
            {"id": "paper-1", "summary": "Done"},
        )
        self.document_store.upsert(
            "sandbox_sessions",
            "paper-1",
            {"paper_id": "paper-1", "workspace_id": workspace_id, "starter_code": "print(1)"},
        )

        response = self.client.delete("/paper/paper-1")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(self.document_store.get("papers", "paper-1"))
        self.assertIsNone(self.document_store.get("jobs", "job-1"))
        self.assertIsNone(self.document_store.get("paper_outputs", "paper-1"))
        self.assertIsNone(self.document_store.get("sandbox_sessions", "paper-1"))
        self.assertFalse(pdf_path.exists())
        self.assertFalse(text_path.exists())

    def test_firebase_session_sync_creates_workspace_user(self) -> None:
        response = self.client.get(
            "/auth/session",
            headers={"Authorization": "Bearer firebase-test-token"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["user"]["email"], "firebase@example.com")
        self.assertTrue(self.document_store.list("users", {"auth_provider": "firebase", "auth_subject": "firebase-user-1"}))


if __name__ == "__main__":
    unittest.main()
