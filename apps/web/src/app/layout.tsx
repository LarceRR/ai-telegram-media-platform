import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'ATMP Admin',
  description: 'AI-powered automated Telegram media platform: admin console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="mx-auto max-w-5xl px-6 py-10">
            <header className="mb-8">
              <p className="text-xs uppercase tracking-widest text-slate-500">Milestone M0</p>
              <h1 className="text-2xl font-semibold text-slate-100">Platform foundation</h1>
            </header>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
