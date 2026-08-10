import { SystemStatus } from '@/features/system/system-status';

export default function DashboardPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-lg border border-border bg-panel p-5">
        <h2 className="text-sm font-medium text-slate-300">Scope</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Foundation only: monorepo, API and worker processes, PostgreSQL with pgvector, Redis and
          BullMQ, typed configuration, health checks and CI. Channels, sources and the content
          pipeline start in M1.
        </p>
      </section>
      <SystemStatus />
    </main>
  );
}
