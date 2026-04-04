# Deployment Guide

## Backend on Cloud Run

```bash
cd backend
gcloud run deploy paperlab-api \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars APP_ENV=production,FRONTEND_URL=https://paperlab-web-XXXX.run.app,API_BASE_URL=https://paperlab-api-XXXX.run.app,JWT_SECRET=YOUR_SECRET,GEMINI_API_KEY=YOUR_GEMINI_KEY,GCP_PROJECT_ID=YOUR_PROJECT,GCS_BUCKET_PAPERS=YOUR_PAPERS_BUCKET,GCS_BUCKET_SANDBOX=YOUR_SANDBOX_BUCKET,FIRESTORE_DATABASE=(default),ALLOW_LOCAL_STORE_FALLBACK=false,CORS_ORIGINS=https://paperlab-web-XXXX.run.app
```

## Frontend on Cloud Run

```bash
cd frontend
gcloud run deploy paperlab-web \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_API_BASE_URL=https://paperlab-api-XXXX.run.app
```

## Required GCP Resources

- Firestore Native database
- GCS bucket for papers
- GCS bucket for sandbox artifacts
- Cloud Run service account with Firestore and Storage permissions

## Suggested IAM Roles

- `roles/datastore.user`
- `roles/storage.objectAdmin`
- `roles/run.developer`
- `roles/iam.serviceAccountUser`

## Secrets and Config

Use environment variables only. Do not hardcode secrets.

Minimum production variables:

- `JWT_SECRET`
- `GEMINI_API_KEY`
- `GCP_PROJECT_ID`
- `GCS_BUCKET_PAPERS`
- `GCS_BUCKET_SANDBOX`
- `FIRESTORE_DATABASE`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- `NEXT_PUBLIC_API_BASE_URL`
