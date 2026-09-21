import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { RISK_TYPES, COVERAGE_DASHBOARDS, COVERAGE, BLOCKED_REASON, type Cover } from '@/lib/coverage';
import { getProposals, getDetectorRegistry, getDashboardsAdmin } from '@/lib/admin';
import { fmtTime } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { proposeDetector, resolveProposal } from '../config-actions';

export const dynamic = 'force-dynamic';

const MARK: Record<Cover, { ch: string; cls: string }> = {
  covered: { ch: '✓', cls: 'text-(--good)' },
  blocked: { ch: '✕', cls: 'text-(--critical)' },
  planned: { ch: '◷', cls: 'text-(--warning)' },
  na: { ch: '–', cls: 'text-muted-foreground' },
};

export default async function CoveragePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await isAuthed())) redirect('/login');
  const sp = await searchParams;
  const [proposalsAll, registry, dashboards] = await Promise.all([getProposals(), getDetectorRegistry(), getDashboardsAdmin()]);
  const proposals = proposalsAll.filter((p) => p.status === 'open');

  // Reality check: detector counts per dashboard straight from the registry, so
  // the curated matrix above can't quietly claim coverage that doesn't exist.
  const liveByDash = new Map<string, { total: number; enabled: number }>();
  for (const d of registry) {
    const cur = liveByDash.get(d.dashboardId) ?? { total: 0, enabled: 0 };
    cur.total += 1;
    if (d.enabled) cur.enabled += 1;
    liveByDash.set(d.dashboardId, cur);
  }

  return (
    <>
      <PageHeader
        eyebrow="Coverage"
        question="What are we watching, and what are the blind spots?"
        answer="The intended detector coverage per dashboard next to what actually runs, so a tick can never claim a rule that does not exist. Click a gap to propose a detector."
      />

      <Card>
        <CardHeader>
          <CardTitle>Detector coverage, intended</CardTitle>
          <CardDescription>What each dashboard is, and is not, meant to watch. Click a gap to propose a detector.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Risk type</TableHead>
                  {COVERAGE_DASHBOARDS.map((d) => <TableHead key={d} className="text-center">{d}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {RISK_TYPES.map((rt) => (
                  <TableRow key={rt}>
                    <TableCell className="font-medium">{rt}</TableCell>
                    {COVERAGE_DASHBOARDS.map((d) => {
                      const c = (COVERAGE[d]?.[rt] ?? 'na') as Cover;
                      const m = MARK[c];
                      const isGap = c === 'blocked' || c === 'planned';
                      const title = c === 'blocked' ? `Blocked: ${BLOCKED_REASON[rt] ?? 'data not exposed'}, click to propose` : isGap ? 'Click to propose a detector' : c;
                      return (
                        <TableCell key={d} className={`text-center ${m.cls}`} title={title}>
                          {isGap ? (
                            <Link href={`/setnel/coverage?d=${encodeURIComponent(d)}&r=${encodeURIComponent(rt)}#propose`} className="block hover:underline">{m.ch}</Link>
                          ) : m.ch}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center gap-4 px-4 pt-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="text-(--good)">✓</span> covered</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-(--critical)">✕</span> blocked, data gap</span>
            <span className="inline-flex items-center gap-1.5"><span className="text-(--warning)">◷</span> planned, not wired</span>
            <span className="inline-flex items-center gap-1.5"><span>–</span> n/a</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live detectors, actual</CardTitle>
          <CardDescription>Straight from the registry, what really exists so the matrix cannot lie.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Dashboard</TableHead>
                  <TableHead className="text-right">Detectors</TableHead>
                  <TableHead className="text-right">Enabled</TableHead>
                  <TableHead className="text-right">Reality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboards.filter((d) => d.enabled).map((d) => {
                  const live = liveByDash.get(d.id) ?? { total: 0, enabled: 0 };
                  const cls = live.total === 0 ? 'text-(--critical)' : live.enabled === 0 ? 'text-(--warning)' : 'text-(--good)';
                  return (
                    <TableRow key={d.id}>
                      <TableCell><Link href={`/setnel/dashboards/${d.id}`} className="font-medium hover:underline">{d.name}</Link></TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{live.total}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{live.enabled}</TableCell>
                      <TableCell className={`text-right ${cls}`}>
                        {live.total === 0 ? '✕ no detectors' : live.enabled === 0 ? '◷ all disabled' : '✓ active'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="px-4 pt-4 text-xs text-muted-foreground">
            An onboarded dashboard with <b>no detectors</b> is monitored for liveness only, the intended-coverage matrix above may still show ticks that are not backed by a running rule.
          </p>
        </CardContent>
      </Card>

      <Card id="propose">
        <CardHeader>
          <CardTitle>Propose a detector</CardTitle>
          <CardDescription>Turn a blind spot into a tracked request.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={proposeDetector} className="flex flex-wrap items-center gap-2">
            <NativeSelect name="dashboardId" defaultValue={sp.d ?? ''} className="w-48">
              <NativeSelectOption value="">Dashboard</NativeSelectOption>
              {COVERAGE_DASHBOARDS.map((d) => <NativeSelectOption key={d} value={d}>{d}</NativeSelectOption>)}
            </NativeSelect>
            <NativeSelect name="riskType" defaultValue={sp.r ?? ''} required className="w-52">
              <NativeSelectOption value="">Risk type</NativeSelectOption>
              {RISK_TYPES.map((rt) => <NativeSelectOption key={rt} value={rt}>{rt}</NativeSelectOption>)}
            </NativeSelect>
            <Input name="note" placeholder="What should it detect? (optional)" maxLength={500} className="w-72" />
            <Button type="submit">Propose detector</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open proposals</CardTitle>
          <CardDescription>{proposals.length} pending. Proposed detectors also show up in the Inbox.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None yet. Proposed detectors also show up in the <Link href="/setnel/inbox" className="underline underline-offset-4 hover:text-foreground">Inbox</Link>.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {proposals.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                  <span className="font-mono text-xs text-muted-foreground">{fmtTime(p.created_at)}</span>
                  <span className="font-medium">{p.dashboardId ?? 'any'}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{p.riskType}</span>
                  {p.note ? <span className="text-muted-foreground">{p.note}</span> : null}
                  {p.proposedBy ? <span className="text-muted-foreground">by {p.proposedBy}</span> : null}
                  <form action={resolveProposal} className="ml-auto inline">
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" variant="ghost" size="sm">Close</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Blocked cells need the dashboard to expose specific data (per-wallet health factors, per-asset oracle prices). See <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">docs/ONBOARD_A_DASHBOARD.md</code>.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
