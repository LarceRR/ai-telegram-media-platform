import { ChannelsPanel } from '@/features/channels/channels-panel';
import { SourcesPanel } from '@/features/sources/sources-panel';
import { SystemStatus } from '@/features/system/system-status';
import { PostEditor } from '@/features/posts/post-editor';

export default function DashboardPage() {
  return (
    <main className="space-y-6">
      <section className="rounded-lg border border-border bg-panel p-5"><h2 className="text-sm font-medium text-slate-300">M5: editorial workflow</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Review provenance, edit safely, and route posts through audited moderation without losing version history.</p></section>
      <PostEditor />
      <ChannelsPanel />
      <SourcesPanel />
      <SystemStatus />
    </main>
  );
}
