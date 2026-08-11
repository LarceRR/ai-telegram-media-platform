'use client';

import { channelResponseSchema } from '@atmp/contracts';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

const channelListSchema = channelResponseSchema.array();

export function ChannelsPanel() {
  const channels = useQuery({
    queryKey: ['channels'],
    queryFn: () => apiGet('/channels', channelListSchema),
  });

  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-300">Channels</h2>
        <span className="text-xs text-slate-500">scoped RBAC</span>
      </div>
      {channels.isPending ? <p className="mt-4 text-sm text-slate-500">Loading channels...</p> : null}
      {channels.isError ? <p className="mt-4 text-sm text-rose-300">Channel API unavailable.</p> : null}
      {channels.data?.length === 0 ? <p className="mt-4 text-sm text-slate-500">No channels yet.</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {channels.data?.map((channel) => (
          <article key={channel.id} className="rounded-md border border-border/70 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium text-slate-200">{channel.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{channel.telegramId} · {channel.language}</p>
              </div>
              <span className="rounded bg-slate-500/15 px-2 py-0.5 text-xs text-slate-300">{channel.role}</span>
            </div>
            <div className="mt-3 flex gap-2 text-xs text-slate-500">
              <span>{channel.status.toLowerCase()}</span><span>·</span>
              <span>{channel.telegramCredentialConfigured ? 'telegram linked' : 'telegram not linked'}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
