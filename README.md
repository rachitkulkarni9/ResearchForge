# PaperLab

PaperLab is a hackathon-friendly SaaS platform that turns research papers into structured analysis plus an executable sandbox. Users sign in, upload a PDF, trigger a multi-agent Gemini pipeline, review summaries and insights, ask follow-up questions, and run editable starter code in a Python sandbox.

## Stack

- Frontend: Next.js App Router
- Backend: FastAPI
- AI: Google Gemini API
- Storage: Google Cloud Storage for PDFs and sandbox artifacts
- Database: Firestore for users, workspaces, papers, jobs, outputs, usage, and sandbox sessions
- Deployment: Google Cloud Run

## Monorepo Structure

```txt
backend/
  app/
    agents/
    core/
    models/
    orchestrator/
    routes/
    sandbox/
    schemas/
    services/
    utils/
frontend/
  app/
  components/
  lib/
  types/
docs/
```

## Architecture

The backend is organized around a small set of responsibilities:

- `routes/`: API surface for auth, papers, Q&A, and sandbox operations
- `services/`: integrations for Firestore, Cloud Storage, PDF extraction, Gemini, usage tracking, and workspace lifecycle
- `agents/`: modular Gemini agents, one file per role
- `orchestrator/`: the background job pipeline that coordinates extraction, agent execution, output merge, and status updates
- `sandbox/`: Python code execution with timeout and output capture
- `schemas/`: strict Pydantic models, including the required Gemini JSON contract

The frontend is a thin dashboard built on those APIs:

- login panel for hackathon auth
- dashboard for uploads and paper list
- detail page for summary, insights, implementation guidance, tutor Q&A, and sandbox editing/runs

## SaaS Data Model

Firestore collections:

- `users`: user profile and default workspace
- `workspaces`: tenant root record and future plan metadata
- `workspace_members`: user membership and role
- `papers`: uploaded paper metadata and processing status
- `jobs`: background job state and retry/error tracking
- `paper_outputs`: validated structured Gemini output
- `sandbox_sessions`: starter code, current code, and last run output
- `usage_events`: analytics and billing-ready events

Core multi-tenant rule:

- every protected record is scoped by `workspace_id`
- every request uses a bearer token containing `sub` and `workspace_id`
- access is checked against `workspace_members`

## Agent Flow

1. Ingestion Agent cleans and truncates extracted paper text for downstream work.
2. Summary Agent produces the summary and section structure.
3. Insight Agent extracts key insights, novel contributions, and limitations.
4. Math Explainer Agent turns formulas into plain-language explanations.
5. Implementation Agent turns the paper into practical execution steps.
6. Sandbox Code Agent generates starter code and sandbox tasks.
7. Tutor Agent answers follow-up questions from stored output.
8. Orchestrator Agent coordinates the full pipeline and merges the final strict JSON payload.

All stored AI output conforms to:

```json
{
  "summary": "",
  "sections": [],
  "key_insights": [],
  "novel_contributions": [],
  "limitations": [],
  "math_explanations": [],
  "implementation_steps": [],
  "sandbox_tasks": [],
  "starter_code": "",
  "qa_ready": true
}
```

## Sandbox Execution Design

The sandbox is intentionally simple for hackathon speed:

- the frontend provides a large editable text area as the code editor
- `POST /sandbox/run` sends Python source to FastAPI
- the backend writes the code into a temporary file and runs it in a subprocess
- stdout and stderr are captured and returned
- execution is bounded by a timeout and output-size cap
- `POST /sandbox/reset` restores the saved starter code

This is functional, but not production-grade isolation. For a hardened version, move execution into isolated containers or gVisor-based workers.

## Local Development

### 1. Backend

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

### 2. Frontend

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Frontend defaults to `http://localhost:3000` and backend defaults to `http://localhost:8000`.

## Environment Variables

### Backend

See [backend/.env.example](backend/.env.example).

Important values:

- `JWT_SECRET`
- `GEMINI_API_KEY`
- `GCP_PROJECT_ID`
- `GCS_BUCKET_PAPERS`
- `GCS_BUCKET_SANDBOX`
- `FIRESTORE_DATABASE`
- `ALLOW_LOCAL_STORE_FALLBACK`

### Frontend

See [frontend/.env.example](frontend/.env.example).

- `NEXT_PUBLIC_API_BASE_URL`

## Google Cloud Configuration

Minimum GCP setup:

1. Create a GCP project.
2. Enable Firestore in Native mode.
3. Create two GCS buckets:
   - paper uploads
   - sandbox artifacts
4. Create a service account for Cloud Run.
5. Grant roles:
   - Firestore User
   - Storage Object Admin on the two buckets
   - Cloud Run Invoker as needed
6. Set Cloud Run environment variables from `.env.example`.
7. Deploy backend and frontend services.

## Cloud Run Deployment

A more detailed guide is in [docs/deployment.md](docs/deployment.md).

Backend deploy shape:

```bash
gcloud run deploy paperlab-api \
  --source ./backend \
  --region us-central1 \
  --allow-unauthenticated
```

Frontend deploy shape:

```bash
gcloud run deploy paperlab-web \
  --source ./frontend \
  --region us-central1 \
  --allow-unauthenticated
```

## Notes and Limitations

- The backend supports local filesystem-backed fallback storage for development when GCP resources are not configured.
- Gemini falls back to a safe placeholder output when `GEMINI_API_KEY` is absent so the app still runs locally.
- The sandbox executes Python code in-process via subprocess with timeout only; it should be isolated further before production use.
- Authentication is intentionally simple and ready to be swapped with a stronger provider later.
