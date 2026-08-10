import { ChannelsPanel } from '@/features/channels/channels-panel';
import { SystemStatus } from '@/features/system/system-status';

export default function DashboardPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-lg border border-border bg-panel p-5">
        <h2 className="text-sm font-medium text-slate-300">M1: channel access</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Channels are isolated by membership. Owners control protected rules and credential
          references; editors can change bounded optimizable settings.
        </p>
      </section>
      <ChannelsPanel />
      <SystemStatus />
    </main>
  );
}
