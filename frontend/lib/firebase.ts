'use client';

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { GoogleAuthProvider, browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, type Auth, type User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);

export const firebaseApp: FirebaseApp | null = firebaseEnabled
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const googleProvider = firebaseAuth ? new GoogleAuthProvider() : null;

let persistencePromise: Promise<void> | null = null;
let authReadyPromise: Promise<User | null> | null = null;

export function ensureFirebasePersistence(): Promise<void> {
  if (!firebaseAuth) {
    return Promise.resolve();
  }
  if (!persistencePromise) {
    persistencePromise = setPersistence(firebaseAuth, browserLocalPersistence);
  }
  return persistencePromise;
}

export function waitForFirebaseAuthReady(): Promise<User | null> {
  if (!firebaseAuth) {
    return Promise.resolve(null);
  }
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }
  return authReadyPromise;
}
