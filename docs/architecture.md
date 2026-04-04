# Architecture

## Services

- Frontend service: Next.js UI for auth, dashboard, uploads, results, Q&A, and sandbox interaction.
- Backend service: FastAPI API that owns auth, uploads, job orchestration, Gemini calls, and sandbox execution.
- Storage service: Google Cloud Storage stores the source PDFs and any derived sandbox artifacts.
- Database service: Firestore stores all tenant-scoped application records.
- AI service: Gemini powers the specialist agent pipeline and tutor Q&A.

## Request and Processing Flow

1. The user signs in through `POST /auth/login`.
2. The frontend stores the bearer token in local storage.
3. The user uploads a PDF through `POST /upload-paper`.
4. The backend writes the PDF to Cloud Storage and creates `papers` and `jobs` records in Firestore.
5. A background task starts the orchestrator.
6. The orchestrator extracts PDF text, runs the specialized agents, validates the final JSON, stores outputs, creates a sandbox session, and updates the job state.
7. The frontend polls paper detail pages and renders the structured output when processing completes.
8. Follow-up questions use `POST /ask-question` against stored outputs.
9. Sandbox runs use `POST /sandbox/run` and `POST /sandbox/reset`.

## Status Model

Jobs and papers move through:

- `pending`
- `processing`
- `completed`
- `failed`
