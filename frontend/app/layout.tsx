'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Inter } from 'next/font/google';
import { Bell, FileText, FlaskConical, LayoutDashboard, LogOut, MessageSquare, Moon, Sun, Terminal, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AppShellProvider, useAppShellSession } from '@/components/AppShellContext';
import { apiFetch } from '@/lib/api';
import { firebaseAuth } from '@/lib/firebase';

const inter = Inter({
  subsets: ['latin'],
});

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Papers', href: '/papers', icon: FileText },
  { label: 'Sandbox', href: '/sandbox', icon: Terminal },
  { label: 'Q&A', href: '/qa', icon: MessageSquare },
  { label: 'Account', href: '/account', icon: User },
] as const;

function getPageTitle(pathname: string) {
  if (pathname === '/dashboard') {
    return 'Dashboard';
  }
  if (pathname === '/papers') {
    return 'My Papers';
  }
  if (pathname === '/sandbox') {
    return 'Sandbox';
  }
  if (pathname === '/qa') {
    return 'Q&A';
  }
  if (pathname === '/account') {
    return 'Account';
  }
  if (pathname.includes('/sandbox')) {
    return 'Sandbox';
  }
  if (pathname.includes('/qa')) {
    return 'Q&A';
  }
  if (pathname.includes('/implementation')) {
    return 'Implementation';
  }
  if (pathname.includes('/insights')) {
    return 'Insights';
  }
  if (pathname.includes('/math')) {
    return 'Math';
  }
  if (pathname.includes('/summary')) {
    return 'Summary';
  }
  if (pathname.startsWith('/papers/')) {
    return 'Paper Workspace';
  }
  return 'Dashboard';
}

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return initials || 'RF';
}

function AppShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, session, setSession } = useAppShellSession();
  const [darkMode, setDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const storedPreference = window.localStorage.getItem('researchforge-dark-mode');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedDarkMode = storedPreference !== null ? storedPreference === 'true' : prefersDark;
    root.classList.toggle('dark', resolvedDarkMode);
    setDarkMode(resolvedDarkMode);
    setMounted(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    window.localStorage.setItem('researchforge-dark-mode', String(darkMode));
  }, [darkMode]);

  const showShell = Boolean(session);
  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);
  const initials = getInitials(session?.user.name ?? '');
  const currentPaperBase = useMemo(() => {
    const match = pathname.match(/^\/papers\/[^/]+/);
    return match ? match[0] : null;
  }, [pathname]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!session && pathname !== '/') {
      router.replace('/');
    }
  }, [pathname, ready, router, session]);

  async function handleLogout() {
    if (firebaseAuth) {
      await firebaseAuth.signOut();
    } else {
      await apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' });
    }
    setSession(null);
    router.replace('/');
  }

  return (
    <div className={inter.className}>
      <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        {showShell ? (
          <>
            <aside className="fixed left-0 top-0 hidden h-screen w-60 flex-col border-r border-gray-200 bg-white lg:flex dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-3 px-5 py-5">
                <FlaskConical className="h-5 w-5 text-violet-700" />
                <span className="font-bold text-gray-900 dark:text-gray-100">ResearchForge</span>
              </div>

              <nav className="space-y-1 px-3">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const href =
                    item.label === 'Sandbox' && currentPaperBase ? `${currentPaperBase}/sandbox` :
                    item.label === 'Q&A' && currentPaperBase ? `${currentPaperBase}/qa` :
                    item.href;
                  const isActive =
                    (item.label === 'Dashboard' && (pathname === '/dashboard' || pathname === '/')) ||
                    (item.label === 'My Papers' && pathname === '/papers') ||
                    (item.label === 'Sandbox' && (pathname === '/sandbox' || pathname.includes('/sandbox'))) ||
                    (item.label === 'Q&A' && (pathname === '/qa' || pathname.includes('/qa'))) ||
                    (item.label === 'Account' && pathname === '/account');

                  return (
                    <Link
                      key={item.label}
                      href={href}
                      className={`flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'rounded-lg bg-violet-50 font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
                          : 'rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto border-t border-gray-200 px-5 py-4 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {session?.user.name ?? (ready ? 'ResearchForge' : 'Loading...')}
                    </div>
                    <div className="mt-0.5 break-all text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                      {session?.user.email ?? 'Sign in to load your account'}
                    </div>
                  </div>
                </div>
                {session ? (
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-all duration-200 ease-in-out hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                ) : null}
              </div>
            </aside>

            <header className="fixed left-0 right-0 top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:left-60 lg:px-6 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{pageTitle}</div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDarkMode((value) => !value)}
                  className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  aria-label="Toggle dark mode"
                >
                  {mounted && darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                </button>
              </div>
            </header>
          </>
        ) : null}

        {!showShell ? (
          <div className="fixed right-4 top-4 z-20">
            <button
              type="button"
              onClick={() => setDarkMode((value) => !value)}
              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-colors hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="Toggle dark mode"
            >
              {mounted && darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        ) : null}

        <main className={showShell ? 'min-h-screen bg-gray-50 p-6 pt-20 lg:ml-60 dark:bg-gray-950' : ''}>{children}</main>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = localStorage.getItem('researchforge-dark-mode');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var useDark = stored !== null ? stored === 'true' : prefersDark;
                  document.documentElement.classList.toggle('dark', useDark);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <AppShellProvider>
          <AppShellFrame>{children}</AppShellFrame>
        </AppShellProvider>
      </body>
    </html>
  );
}
