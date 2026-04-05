import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ResearchForge',
  description: 'Paper-to-sandbox SaaS for technical research papers.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
