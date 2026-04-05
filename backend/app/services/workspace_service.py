from app.models.domain import UserRecord, WorkspaceMemberRecord, WorkspaceRecord
from app.services.document_store import DocumentStore


class WorkspaceService:
    def __init__(self, document_store: DocumentStore):
        self.document_store = document_store

    def get_user_by_email(self, email: str) -> dict | None:
        users = self.document_store.list("users", {"email": email})
        return users[0] if users else None

    def get_user_by_auth_subject(self, auth_provider: str, auth_subject: str) -> dict | None:
        users = self.document_store.list(
            "users",
            {"auth_provider": auth_provider, "auth_subject": auth_subject},
        )
        return users[0] if users else None

    def get_workspace_member(self, workspace_id: str, user_id: str) -> dict | None:
        members = self.document_store.list(
            "workspace_members",
            {"workspace_id": workspace_id, "user_id": user_id},
        )
        return members[0] if members else None

    def create_user_with_workspace(
        self,
        email: str,
        name: str,
        password_hash: str,
        auth_provider: str = "local",
        auth_subject: str = "",
    ) -> tuple[dict, dict]:
        workspace = WorkspaceRecord(name=f"{name}'s Workspace", owner_user_id="")
        user = UserRecord(
            email=email,
            name=name,
            password_hash=password_hash,
            auth_provider=auth_provider,
            auth_subject=auth_subject,
            default_workspace_id=workspace.id,
        )
        workspace.owner_user_id = user.id
        member = WorkspaceMemberRecord(workspace_id=workspace.id, user_id=user.id, role="owner")

        self.document_store.upsert("users", user.id, user.model_dump(mode="json"))
        self.document_store.upsert("workspaces", workspace.id, workspace.model_dump(mode="json"))
        self.document_store.upsert("workspace_members", member.id, member.model_dump(mode="json"))
        return user.model_dump(mode="json"), workspace.model_dump(mode="json")

    def update_user(self, user: dict) -> dict:
        self.document_store.upsert("users", user["id"], user)
        return user

    def sync_firebase_user(self, claims: dict) -> tuple[dict, dict]:
        uid = claims["uid"]
        email = claims.get("email")
        if not email:
            raise ValueError("Firebase token is missing an email address")

        name = claims.get("name") or email.split("@", 1)[0]
        user = self.get_user_by_auth_subject("firebase", uid)
        if not user:
            user = self.get_user_by_email(email)

        if user:
            user["email"] = email
            user["name"] = name
            user["auth_provider"] = "firebase"
            user["auth_subject"] = uid
            user.setdefault("password_hash", "")
            user = self.update_user(user)
            workspace = self.document_store.get("workspaces", user["default_workspace_id"])
            if not workspace:
                raise ValueError("Workspace not found for authenticated user")
            return user, workspace

        return self.create_user_with_workspace(
            email=email,
            name=name,
            password_hash="",
            auth_provider="firebase",
            auth_subject=uid,
        )
