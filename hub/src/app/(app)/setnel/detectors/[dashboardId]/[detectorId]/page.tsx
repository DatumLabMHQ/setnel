import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getDetectorRegistry, getBaselineMetrics, getBaselineFpCounts } from '@/lib/admin';
import { getIncidents, getMetricsForDashboard } from '@/lib/queries';
import { timeAgo } from '@/lib/format';
import { setDetectorEnabled, setDetectorSeverity } from '../../../config-actions';
import { muteDetector } from '../../../actions';
import { IncidentCard } from '../../../incident-card';
import { BacktestTuner } from './tuner';
import { PageHeader } from '@/components/page-header';
import { DetailLayout } from '@/components/detail-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';

export const dynamic = 'force-dynamic';

const SEV_OPTS = ['info', 'warning', 'critical', 'emergency'] as const;

const SEV_BADGE: Record<string, string> = {
  info: 'bg-(--info-soft) text-(--info) border-transparent',
  warning: 'bg-(--warning-soft) text-(--warning) border-transparent',
  critical: 'bg-(--critical-soft) text-(--critical) border-transparent',
  emergency: 'bg-(--critical-soft) text-(--emergency) border-transparent',
};

export default async function DetectorDetail({ params }: { params: Promise<{ dashboardId: string; detectorId: string }> }) {
  if (!(await isAuthed())) redirect('/login');
  const { dashboardId, detectorId: raw } = await params;
  const detectorId = decodeURIComponent(raw);

  const [registry, incidents, metrics, baselines, fpCounts] = await Promise.all([
    getDetectorRegistry(),
    getIncidents({ dashboardId, status: 'all' }),
    getMetricsForDashboard(dashboardId),
    getBaselineMetrics(),
    getBaselineFpCounts(dashboardId),
  ]);

  const d = registry.find((x) => x.dashboardId === dashboardId && x.detectorId === detectorId);
  if (!d) notFound();

  const mine = incidents.filter((i) => i.detector_id === detectorId);
  const active = mine.filter((i) => i.status === 'active');
  const fpRate = d.total > 0 ? Math.round((d.falsePositives / d.total) * 100) : 0;
  const isBaseline = detectorId === 'baseline.anomaly';

  // Build the tuner's per-metric input: this dashboard's history, saved overrides,
  // and how many false positives each metric has produced (drives suggestions).
  const savedByKey = new Map(baselines.map((b) => [b.metricKey, b]));
  const tunerMetrics = isBaseline
    ? metrics.map((m) => ({
        metricKey: m.metricKey,
        values: m.points.map((p) => p.value),
        savedZ: savedByKey.get(m.metricKey)?.z ?? null,
        savedMinPct: savedByKey.get(m.metricKey)?.minPct ?? null,
        fpCount: fpCounts.get(m.metricKey) ?? 0,
      }))
    : [];

  const stats = [
    { label: '90 day fires', value: String(d.total), sub: 'incidents', tone: '', small: false },
    { label: 'False positives', value: String(d.falsePositives), sub: `${fpRate}% of fires`, tone: fpRate >= 30 ? 'text-(--critical)' : '', small: false },
    { label: 'Active now', value: String(active.length), sub: 'open incidents', tone: active.length ? 'text-(--warning)' : 'text-(--good)', small: false },
    { label: 'Last seen', value: timeAgo(d.lastSeen), sub: 'most recent fire', tone: '', small: true },
  ];

  const main = (
    <>
      {isBaseline ? (
        <Card>
          <CardHeader>
            <CardTitle>Live tune from backtest</CardTitle>
            <CardDescription>Drag the thresholds and watch the would fire count over stored history for every metric.</CardDescription>
          </CardHeader>
          <CardContent>
            {tunerMetrics.length === 0 ? (
              <Empty>
                <EmptyTitle>No metric history yet</EmptyTitle>
                <EmptyDescription>This dashboard has not stored any metric samples to backtest against.</EmptyDescription>
              </Empty>
            ) : (
              <BacktestTuner metrics={tunerMetrics} />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Tuning</CardTitle>
            <CardDescription>Why this detector has no draggable thresholds.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="max-w-[72ch] text-sm text-muted-foreground">
              This detector is code defined in the dashboard&rsquo;s repo, so its firing logic lives there, not in a threshold you can drag.
              From here you can disable it, override its severity, or mute it. Only the adaptive <code className="font-mono">baseline.anomaly</code> detector supports live threshold tuning.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent incidents</CardTitle>
          <CardDescription>{mine.length} from this detector, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <Empty>
              <EmptyTitle>No incidents yet</EmptyTitle>
              <EmptyDescription>This detector has not fired.</EmptyDescription>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {mine.slice(0, 20).map((i) => <IncidentCard key={i.id} i={i} />)}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );

  const aside = (
    <>
      <Card>
        <CardHeader>
          <CardTitle>At a glance</CardTitle>
          <CardDescription>How often this detector fires and whether it is noisy.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <span className={`font-mono tabular-nums ${s.small ? 'text-base' : 'text-xl'} ${s.tone}`}>{s.value}</span>
              <span className="text-xs font-medium text-foreground">{s.label}</span>
              <span className="text-xs text-muted-foreground">{s.sub}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Controls</CardTitle>
          <CardDescription>Turn it off, force a severity, or silence it for a day.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form action={setDetectorEnabled}>
            <input type="hidden" name="dashboardId" value={dashboardId} />
            <input type="hidden" name="detectorId" value={detectorId} />
            <input type="hidden" name="enabled" value={d.enabled ? 'false' : 'true'} />
            <Button type="submit" variant={d.enabled ? 'destructive' : 'default'} className="w-full">
              {d.enabled ? 'Disable detector' : 'Enable detector'}
            </Button>
          </form>
          <form action={setDetectorSeverity} className="flex items-center gap-2">
            <input type="hidden" name="dashboardId" value={dashboardId} />
            <input type="hidden" name="detectorId" value={detectorId} />
            <NativeSelect name="severity" defaultValue={d.severityOverride ?? ''} className="flex-1">
              <option value="">severity: default</option>
              {SEV_OPTS.map((s) => <option key={s} value={s}>force {s}</option>)}
            </NativeSelect>
            <Button type="submit" variant="outline">Set severity</Button>
          </form>
          <form action={muteDetector}>
            <input type="hidden" name="dashboardId" value={dashboardId} />
            <input type="hidden" name="detectorId" value={detectorId} />
            <input type="hidden" name="minutes" value="1440" />
            <Button type="submit" variant="outline" className="w-full">Mute 24h</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 text-sm text-muted-foreground lg:px-6">
        <Link href="/setnel/detectors" className="hover:text-foreground">Detectors</Link>
        <span aria-hidden>/</span>
        <Link href={`/setnel/dashboards/${dashboardId}`} className="hover:text-foreground">{dashboardId}</Link>
      </div>

      <PageHeader
        eyebrow="Detector"
        question={detectorId}
        answer={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={d.enabled ? 'bg-(--good-soft) text-(--good) border-transparent' : 'border-border text-muted-foreground'}>
              {d.enabled ? 'enabled' : 'disabled'}
            </Badge>
            {d.severityOverride ? (
              <Badge className={SEV_BADGE[d.severityOverride] ?? 'border-border text-muted-foreground'}>
                severity forced to {d.severityOverride}
              </Badge>
            ) : null}
          </span>
        }
      />

      <DetailLayout main={main} aside={aside} />
    </>
  );
}
