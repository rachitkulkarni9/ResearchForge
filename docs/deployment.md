# Deployment Guide

## Backend on Cloud Run

```bash
cd backend
gcloud run deploy researchforge-api \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars APP_ENV=production,FRONTEND_URL=https://researchforge-web-XXXX.run.app,API_BASE_URL=https://researchforge-api-XXXX.run.app,JWT_SECRET=YOUR_SECRET,USE_VERTEX_AI=true,GCP_PROJECT_ID=YOUR_PROJECT,FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT,GCP_LOCATION=us-central1,GCS_BUCKET_PAPERS=YOUR_PAPERS_BUCKET,GCS_BUCKET_SANDBOX=YOUR_SANDBOX_BUCKET,FIRESTORE_DATABASE=(default),ALLOW_LOCAL_STORE_FALLBACK=false,CORS_ORIGINS=https://researchforge-web-XXXX.run.app
```

## Frontend on Cloud Run

```bash
cd frontend
gcloud run deploy researchforge-web \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NEXT_PUBLIC_API_BASE_URL=https://researchforge-api-XXXX.run.app,NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_KEY,NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com,NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT,NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_BUCKET.appspot.com,NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID,NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID
```

## Required GCP Resources

- Firestore Native database
- GCS bucket for papers
- GCS bucket for sandbox artifacts
- Firebase project with Authentication enabled
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
- `USE_VERTEX_AI=true`
- `GCP_PROJECT_ID`
- `FIREBASE_PROJECT_ID`
- `GCP_LOCATION`
- `GCS_BUCKET_PAPERS`
- `GCS_BUCKET_SANDBOX`
- `FIRESTORE_DATABASE`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
