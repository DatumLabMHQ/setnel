'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { timeAgo, usd, count } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { bulkAck, bulkMute, bulkResolve } from '../actions';

export type TriageIncident = {
  id: string; dashboardName: string; severity: string; message: string;
  detectorId: string; acked: boolean; ackedBy: string | null; muted: boolean;
  exposureUsd: number | null; openedAt: string; eventCount: number;
};

// Severity as a colour and a word, using the Setnel tokens.
const SEV_BADGE: Record<string, string> = {
  info: 'bg-(--info-soft) text-(--info)',
  warning: 'bg-(--warning-soft) text-(--warning)',
  critical: 'bg-(--critical-soft) text-(--critical)',
  emergency: 'bg-(--emergency-soft) text-(--emergency)',
};

export function IncidentTriage({ incidents }: { incidents: TriageIncident[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [minutes, setMinutes] = useState(60);
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();
  const reasonRef = useRef<HTMLInputElement>(null);

  // Targets = the selection, or the focused row if nothing is selected.
  const targets = (): string[] => (sel.size ? [...sel] : incidents[focus] ? [incidents[focus].id] : []);

  const run = (fn: (fd: FormData) => Promise<void>, withMute = false) => {
    const ids = targets();
    if (!ids.length) return;
    start(async () => {
      const fd = new FormData();
      fd.set('ids', ids.join(','));
      if (withMute) { fd.set('minutes', String(minutes)); fd.set('reason', reason); }
      await fn(fd);
      setSel(new Set());
      setReason('');
      router.refresh();
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (!incidents.length) return;
      const k = e.key.toLowerCase();
      if (k === 'j') { e.preventDefault(); setFocus((f) => Math.min(f + 1, incidents.length - 1)); }
      else if (k === 'k') { e.preventDefault(); setFocus((f) => Math.max(f - 1, 0)); }
      else if (k === 'x') { e.preventDefault(); toggle(incidents[focus].id); }
      else if (k === 'a') { e.preventDefault(); run(bulkAck); }
      else if (k === 'r') { e.preventDefault(); run(bulkResolve); }
      else if (k === 'm') { e.preventDefault(); reasonRef.current?.focus(); }
      else if (k === 'escape') { setSel(new Set()); }
      else if (k === 'enter') { e.preventDefault(); router.push(`/setnel/incident/${incidents[focus].id}`); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, focus, sel, minutes, reason]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = sel.size === incidents.length && incidents.length > 0;

  if (!incidents.length) return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><CheckCircleIcon className="text-(--good)" /></EmptyMedia>
        <EmptyTitle>No active incidents</EmptyTitle>
        <EmptyDescription>Everything is quiet right now. New incidents appear here the moment they open.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            className="size-4 shrink-0 cursor-pointer"
            style={{ accentColor: 'var(--foreground)' }}
            checked={allSelected}
            onChange={() => setSel(allSelected ? new Set() : new Set(incidents.map((i) => i.id)))}
          />
          {sel.size ? `${sel.size} selected` : 'Select all'}
        </label>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Button size="sm" disabled={pending} onClick={() => run(bulkAck)}>Ack</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(bulkMute, true)}>Mute</Button>
        <NativeSelect size="sm" className="w-20" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          <NativeSelectOption value={60}>1h</NativeSelectOption>
          <NativeSelectOption value={240}>4h</NativeSelectOption>
          <NativeSelectOption value={1440}>24h</NativeSelectOption>
        </NativeSelect>
        <Input ref={reasonRef} className="w-48" placeholder="Mute reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(bulkResolve)}>Resolve</Button>
        <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">j/k move · x select · a ack · m mute · r resolve · enter open</span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {incidents.map((i, idx) => (
          <li
            key={i.id}
            className={cn(
              'flex list-none items-start gap-3 rounded-lg border p-3 transition-colors',
              idx === focus ? 'border-ring bg-accent/40' : 'border-border',
              sel.has(i.id) ? 'ring-1 ring-ring' : '',
            )}
            onMouseEnter={() => setFocus(idx)}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 cursor-pointer"
              style={{ accentColor: 'var(--foreground)' }}
              checked={sel.has(i.id)}
              onChange={() => toggle(i.id)}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{i.dashboardName}</span>
                <Badge className={`${SEV_BADGE[i.severity] ?? ''} border-transparent`}>{i.severity}</Badge>
                {i.acked ? <Badge variant="secondary">ack{i.ackedBy ? ` ${i.ackedBy}` : ''}</Badge> : null}
                {i.muted ? <Badge variant="secondary">muted</Badge> : null}
                {i.eventCount > 1 ? <Badge variant="secondary" className="font-mono tabular-nums">×{count(i.eventCount)}</Badge> : null}
                {i.exposureUsd ? <Badge className="border-transparent bg-(--warning-soft) font-mono tabular-nums text-(--warning)">{usd(i.exposureUsd)} at risk</Badge> : null}
              </div>
              <a className="text-sm text-foreground hover:underline" href={`/setnel/incident/${i.id}`}>{i.message}</a>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono">{i.detectorId}</span>
                <span aria-hidden>·</span>
                <span>opened {timeAgo(i.openedAt)}</span>
                <span aria-hidden>·</span>
                <a href={`/setnel/incident/${i.id}`} className="inline-flex items-center gap-1 text-foreground hover:underline">
                  details <ArrowRightIcon className="size-3" />
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
