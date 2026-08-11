import { ChannelsPanel } from '@/features/channels/channels-panel';
import { SourcesPanel } from '@/features/sources/sources-panel';
import { SystemStatus } from '@/features/system/system-status';

export default function DashboardPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-lg border border-border bg-panel p-5">
        <h2 className="text-sm font-medium text-slate-300">M2: sources and ingestion</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">Manage multiple RSS/web sources, run safe health checks, and ingest normalized source items without duplicates.</p>
      </section>
      <ChannelsPanel />
      <SourcesPanel />
      <SystemStatus />
    </main>
  );
}
