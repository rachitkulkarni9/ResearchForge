from app.models.domain import UserRecord, WorkspaceMemberRecord, WorkspaceRecord
from app.services.document_store import DocumentStore


class WorkspaceService:
    def __init__(self, document_store: DocumentStore):
        self.document_store = document_store

    def get_user_by_email(self, email: str) -> dict | None:
        users = self.document_store.list("users", {"email": email})
        return users[0] if users else None

    def get_workspace_member(self, workspace_id: str, user_id: str) -> dict | None:
        members = self.document_store.list(
            "workspace_members",
            {"workspace_id": workspace_id, "user_id": user_id},
        )
        return members[0] if members else None

    def create_user_with_workspace(self, email: str, name: str) -> tuple[dict, dict]:
        workspace = WorkspaceRecord(name=f"{name}'s Workspace", owner_user_id="")
        user = UserRecord(email=email, name=name, default_workspace_id=workspace.id)
        workspace.owner_user_id = user.id
        member = WorkspaceMemberRecord(workspace_id=workspace.id, user_id=user.id, role="owner")

        self.document_store.upsert("users", user.id, user.model_dump(mode="json"))
        self.document_store.upsert("workspaces", workspace.id, workspace.model_dump(mode="json"))
        self.document_store.upsert("workspace_members", member.id, member.model_dump(mode="json"))
        return user.model_dump(mode="json"), workspace.model_dump(mode="json")
