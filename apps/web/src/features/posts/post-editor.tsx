'use client';

import { useState } from 'react';

const commands = ['Strengthen hook', 'Shorten', 'Simplify', 'Fact-check', 'Choose another image'];

export function PostEditor() {
  const [text, setText] = useState('Draft headline\n\nWrite the verified story here. Claims, evidence, sources, and the selected image stay visible beside the copy.');
  const [activeCommand, setActiveCommand] = useState('');
  return (
    <section className="grid gap-4 rounded-lg border border-border bg-panel p-5 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-100">Post editor</h2><p className="text-xs text-slate-500">Every substantial edit creates a version and invalidates stale scores.</p></div><span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-300">Needs review</span></div>
        <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-64 w-full rounded-md border border-border bg-slate-950 p-4 text-sm leading-6 text-slate-200 outline-none focus:border-cyan-500" />
        <div className="mt-3 flex flex-wrap gap-2">{commands.map((command) => <button key={command} onClick={() => setActiveCommand(command)} className="rounded-md border border-border px-3 py-2 text-xs text-slate-300 hover:border-cyan-500 hover:text-cyan-300">{command}</button>)}</div>
        {activeCommand && <p className="mt-3 text-xs text-cyan-300">Queued: {activeCommand}. Save a new version before applying AI output.</p>}
      </div>
      <aside className="space-y-3">
        <div className="rounded-md border border-border p-3"><h3 className="text-xs font-medium text-slate-200">Quality scores</h3><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">{[['Interest','8.2'],['Quality','7.8'],['Evidence','9.1'],['Originality','6.9'],['Virality','7.4']].map(([label, score]) => <div key={label} className="rounded bg-slate-950 p-2">{label}<strong className="ml-2 text-slate-100">{score}</strong></div>)}</div></div>
        <div className="rounded-md border border-border p-3"><h3 className="text-xs font-medium text-slate-200">Provenance</h3><p className="mt-2 text-xs leading-5 text-slate-400">3 claims, 5 evidence links, 2 source items. Selected image is source-backed and validated.</p></div>
        <div className="rounded-md border border-border p-3"><h3 className="text-xs font-medium text-slate-200">Version history</h3><p className="mt-2 text-xs text-slate-400">v3 current, v2 fact-check revision, v1 generated draft</p></div>
      </aside>
    </section>
  );
}
