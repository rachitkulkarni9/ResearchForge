'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';

import { apiFetch } from '@/lib/api';
import { ensureFirebasePersistence, firebaseAuth, waitForFirebaseAuthReady } from '@/lib/firebase';

export interface AppShellSession {
  authenticated: boolean;
  token_type: 'session';
  user: {
    id: string;
    name: string;
    email: string;
    default_workspace_id: string;
  };
  workspace: {
    id: string;
    name: string;
    plan: string;
    owner_user_id: string;
  };
}

interface SessionResponse {
  authenticated: boolean;
  token_type: 'session';
  user: {
    id: string;
    email: string;
    name: string;
    default_workspace_id: string;
  };
  workspace: {
    id: string;
    name: string;
    owner_user_id: string;
    plan: string;
  };
}

interface AppShellContextValue {
  ready: boolean;
  session: AppShellSession | null;
  setSession: (session: AppShellSession | null) => void;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

function mapSession(session: SessionResponse): AppShellSession {
  return {
    authenticated: session.authenticated,
    token_type: session.token_type,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      default_workspace_id: session.user.default_workspace_id,
    },
    workspace: {
      id: session.workspace.id,
      name: session.workspace.name,
      plan: session.workspace.plan,
      owner_user_id: session.workspace.owner_user_id,
    },
  };
}

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AppShellSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => {};

    async function syncCookieSession() {
      try {
        const data = await apiFetch<SessionResponse>('/auth/session');
        if (active) {
          setSession(mapSession(data));
        }
      } catch {
        if (active) {
          setSession(null);
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    async function syncFirebaseSession(user: User | null) {
      if (!active) {
        return;
      }

      if (!user) {
        setSession(null);
        setReady(true);
        return;
      }

      try {
        const data = await apiFetch<SessionResponse>('/auth/session');
        if (active) {
          setSession(mapSession(data));
        }
      } catch {
        if (active) {
          setSession(null);
          if (firebaseAuth) {
            await signOut(firebaseAuth);
          }
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    async function bootstrap() {
      if (!firebaseAuth) {
        await syncCookieSession();
        return;
      }

      await ensureFirebasePersistence();
      await waitForFirebaseAuthReady();

      unsubscribe = onIdTokenChanged(firebaseAuth, (user) => {
        void syncFirebaseSession(user);
      });

      await syncFirebaseSession(firebaseAuth.currentUser);
    }

    void bootstrap();

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      ready,
      session,
      setSession,
    }),
    [ready, session],
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShellSession() {
  const context = useContext(AppShellContext);

  if (!context) {
    throw new Error('useAppShellSession must be used within AppShellProvider');
  }

  return context;
}
