import { ensureFirebasePersistence, firebaseAuth, waitForFirebaseAuthReady } from '@/lib/firebase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

async function getFirebaseToken(): Promise<string> {
  if (typeof window === 'undefined' || !firebaseAuth) {
    return '';
  }

  await ensureFirebasePersistence();
  await waitForFirebaseAuthReady();
  const user = firebaseAuth.currentUser;
  if (!user) {
    return '';
  }
  return user.getIdToken();
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  const token = await getFirebaseToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'include',
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const data = await response.json() as { detail?: string };
      if (data.detail) {
        message = data.detail;
      }
    } catch {
      const text = await response.text();
      if (text) {
        message = text;
      }
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export { API_BASE_URL };
