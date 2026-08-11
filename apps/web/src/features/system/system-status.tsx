'use client';

import { readinessSchema, systemMetricsSchema } from '@atmp/contracts';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { apiGet } from '@/lib/api';

const STATUS_STYLES: Record<string, string> = {
  up: 'bg-emerald-500/15 text-emerald-300',
  ok: 'bg-emerald-500/15 text-emerald-300',
  degraded: 'bg-amber-500/15 text-amber-300',
  skipped: 'bg-slate-500/15 text-slate-300',
  down: 'bg-rose-500/15 text-rose-300',
  error: 'bg-rose-500/15 text-rose-300',
};

function Badge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        'rounded px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status] ?? 'bg-slate-500/15 text-slate-300',
      )}
    >
      {status}
    </span>
  );
}

export function SystemStatus() {
  const readiness = useQuery({
    queryKey: ['system', 'readiness'],
    queryFn: () => apiGet('/system/readiness', readinessSchema),
    refetchInterval: 10_000,
  });

  const metrics = useQuery({
    queryKey: ['system', 'metrics'],
    queryFn: () => apiGet('/system/metrics', systemMetricsSchema),
    refetchInterval: 10_000,
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-lg border border-border bg-panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">Dependencies</h2>
          {readiness.data ? <Badge status={readiness.data.status} /> : null}
        </div>

        {readiness.isPending ? <p className="mt-3 text-sm text-slate-500">Checking...</p> : null}
        {readiness.isError ? (
          <p className="mt-3 text-sm text-rose-300">API unreachable. Is the api process running?</p>
        ) : null}

        <ul className="mt-4 space-y-2">
          {readiness.data?.checks.map((check) => (
            <li key={check.name} className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{check.name}</span>
              <span className="flex items-center gap-2">
                {typeof check.latencyMs === 'number' ? (
                  <span className="text-xs text-slate-500">{check.latencyMs}ms</span>
                ) : null}
                <Badge status={check.status} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-panel p-5">
        <h2 className="text-sm font-medium text-slate-300">Queues</h2>

        {metrics.isError ? (
          <p className="mt-3 text-sm text-rose-300">Metrics unavailable.</p>
        ) : null}

        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 font-medium">Queue</th>
              <th className="pb-2 text-right font-medium">Wait</th>
              <th className="pb-2 text-right font-medium">Active</th>
              <th className="pb-2 text-right font-medium">Failed</th>
            </tr>
          </thead>
          <tbody className="text-slate-400">
            {metrics.data?.queues.map((queue) => (
              <tr key={queue.queue} className="border-t border-border/60">
                <td className="py-1.5">{queue.queue}</td>
                <td className="py-1.5 text-right">{queue.waiting}</td>
                <td className="py-1.5 text-right">{queue.active}</td>
                <td className={clsx('py-1.5 text-right', queue.failed > 0 && 'text-rose-300')}>
                  {queue.failed}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
