import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getDetectorRegistry, getBaselineMetrics, type DetectorRow } from '@/lib/admin';
import { timeAgo } from '@/lib/format';
import { setDetectorSeverity, setBaselineThreshold } from '../config-actions';
import { DetectorToggle } from './detector-toggle';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';

export const dynamic = 'force-dynamic';

const SEV_OPTS = ['info', 'warning', 'critical', 'emergency'] as const;

export default async function DetectorsPage() {
  if (!(await isAuthed())) redirect('/login');
  const [detectors, baselines] = await Promise.all([getDetectorRegistry(), getBaselineMetrics()]);

  const groups = new Map<string, DetectorRow[]>();
  for (const d of detectors) {
    const list = groups.get(d.dashboardId) ?? [];
    list.push(d);
    groups.set(d.dashboardId, list);
  }

  const enabledCount = detectors.filter((d) => d.enabled).length;
  const tuned = baselines.filter((b) => b.z != null || b.minPct != null || !b.enabled).length;

  const kpis = [
    { label: 'Detectors', value: String(detectors.length), sub: `${enabledCount} enabled` },
    { label: 'Dashboards', value: String(groups.size), sub: 'with detectors' },
    { label: 'Baseline metrics', value: String(baselines.length), sub: `${tuned} tuned` },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Detectors"
        question="Which rules are watching, and how are they tuned?"
        answer="Every detection rule across the fleet. Disable one to drop its events at ingest, force a severity, or open it to tune its thresholds."
      />

      {/* At a glance: how many rules, where, and how much has been tuned. */}
      <section className="grid grid-cols-3 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="gap-1 pb-0">
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className="font-mono text-2xl tabular-nums">{k.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 text-xs text-muted-foreground">{k.sub}</CardContent>
          </Card>
        ))}
      </section>

      <p className="max-w-[72ch] px-4 text-sm text-muted-foreground lg:px-6">
        Disabling a detector drops its events at ingest, so no incident and no page. A severity override replaces the
        detector&rsquo;s own severity on every future incident. Changes take effect on the next detector run and are logged to the{' '}
        <Link href="/setnel/inbox" className="text-foreground underline underline-offset-4">inbox</Link>.
      </p>

      {[...groups.entries()].map(([dashboardId, rows]) => (
        <Card key={dashboardId}>
          <CardHeader>
            <CardTitle>{dashboardId}</CardTitle>
            <CardDescription>{rows.length} detectors on this dashboard, with 90 day fire counts and current state.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Detector</TableHead>
                  <TableHead className="text-right">90 day fires</TableHead>
                  <TableHead className="text-right">False positives</TableHead>
                  <TableHead className="text-right">Last seen</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => {
                  const fpRate = d.total > 0 ? Math.round((d.falsePositives / d.total) * 100) : 0;
                  return (
                    <TableRow key={d.detectorId}>
                      <TableCell>
                        <Link
                          href={`/setnel/detectors/${d.dashboardId}/${encodeURIComponent(d.detectorId)}`}
                          className="font-mono text-foreground underline-offset-4 hover:underline"
                        >
                          {d.detectorId}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{d.total}</TableCell>
                      <TableCell className={`text-right font-mono tabular-nums ${fpRate >= 30 ? 'text-(--critical)' : ''}`}>
                        {d.falsePositives}{d.total ? ` · ${fpRate}%` : ''}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{timeAgo(d.lastSeen)}</TableCell>
                      <TableCell>
                        <form action={setDetectorSeverity} className="flex items-center gap-2">
                          <input type="hidden" name="dashboardId" value={d.dashboardId} />
                          <input type="hidden" name="detectorId" value={d.detectorId} />
                          <NativeSelect name="severity" defaultValue={d.severityOverride ?? ''} size="sm" className="w-32">
                            <option value="">detector default</option>
                            {SEV_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </NativeSelect>
                          <Button type="submit" variant="outline" size="sm">Set</Button>
                        </form>
                      </TableCell>
                      <TableCell>
                        <DetectorToggle dashboardId={d.dashboardId} detectorId={d.detectorId} enabled={d.enabled} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Baseline anomaly thresholds</CardTitle>
          <CardDescription>Per metric tuning for the adaptive detector, showing samples collected and any saved override.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-[72ch] text-sm text-muted-foreground">
            The baseline detector fires when a metric moves beyond both a sigma (z) threshold and a minimum percent. Leave a
            field blank to use the global default (z {process.env.SETNEL_BASELINE_Z || '3'}, min {process.env.SETNEL_BASELINE_MIN_PCT || '8'}%). Disable to silence anomaly alerts for that metric.
          </p>
          {baselines.length === 0 ? (
            <Empty>
              <EmptyTitle>No sampled metrics yet</EmptyTitle>
              <EmptyDescription>Once metrics start reporting, they will appear here for tuning.</EmptyDescription>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead>Tuning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {baselines.map((b) => (
                  <TableRow key={b.metricKey}>
                    <TableCell className="align-middle font-mono">{b.metricKey}</TableCell>
                    <TableCell className="text-right align-middle font-mono tabular-nums">{b.samples}</TableCell>
                    <TableCell>
                      <form action={setBaselineThreshold} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="metricKey" value={b.metricKey} />
                        <Input className="w-24" name="z" type="number" step="0.1" min="0" defaultValue={b.z ?? ''} placeholder="z default" />
                        <Input className="w-24" name="minPct" type="number" step="0.5" min="0" defaultValue={b.minPct ?? ''} placeholder="min default" />
                        <NativeSelect name="enabled" defaultValue={String(b.enabled)} size="sm" className="w-28">
                          <option value="true">enabled</option>
                          <option value="false">disabled</option>
                        </NativeSelect>
                        <Button type="submit" size="sm">Save</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
