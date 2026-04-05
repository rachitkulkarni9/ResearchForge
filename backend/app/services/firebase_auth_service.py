import logging
from pathlib import Path

from app.core.config import Settings

logger = logging.getLogger(__name__)


class FirebaseAuthService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._app = None
        self._available = False

        try:
            import firebase_admin
            from firebase_admin import credentials

            project_id = settings.firebase_project_id or settings.gcp_project_id or None
            options = {"projectId": project_id} if project_id else None
            credential = None

            credentials_path = settings.google_application_credentials.strip().strip('"').strip("'")
            if credentials_path:
                credential_path = Path(credentials_path)
                if credential_path.exists():
                    credential = credentials.Certificate(str(credential_path))
                else:
                    logger.warning("Firebase Admin credentials file was not found at %s", credential_path)

            try:
                self._app = firebase_admin.get_app()
            except ValueError:
                self._app = firebase_admin.initialize_app(credential or credentials.ApplicationDefault(), options)
            self._available = True
        except Exception as exc:
            logger.warning("Firebase Admin is unavailable: %s", exc)

    def verify_id_token(self, token: str) -> dict:
        if not self._available or not self._app:
            raise RuntimeError("Firebase Admin is not configured. Install firebase-admin and configure project credentials.")

        from firebase_admin import auth

        return auth.verify_id_token(token, app=self._app)
