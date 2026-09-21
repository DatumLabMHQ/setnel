'use client';

import { useState } from 'react';
import { setBaselineThreshold } from '../../../config-actions';
import { backtestFires, suggestZ } from '@/lib/detect';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Metric = { metricKey: string; values: number[]; savedZ: number | null; savedMinPct: number | null; fpCount: number };

const MIN_SAMPLES = 20;

export function BacktestTuner({ metrics }: { metrics: Metric[] }) {
  const [z, setZ] = useState(3);
  const [minPct, setMinPct] = useState(8);
  const [window, setWindow] = useState(400);

  const rows = metrics.map((m) => ({
    ...m,
    fires: backtestFires(m.values, { z, minPct, window, minSamples: MIN_SAMPLES }).length,
    // For metrics that produced false positives, a z that would have silenced
    // every past fire — the "learn from your dismissals" suggestion.
    suggested: m.fpCount > 0 && m.values.length > MIN_SAMPLES ? suggestZ(m.values, { minPct, window, minSamples: MIN_SAMPLES }) : null,
  }));
  const totalFires = rows.reduce((a, r) => a + r.fires, 0);
  const withFps = rows.filter((r) => r.suggested != null);

  const totalTone = totalFires > 20 ? 'text-(--critical)' : totalFires > 5 ? 'text-(--warning)' : 'text-(--good)';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Slider label="z-score threshold" value={z} min={1} max={6} step={0.1} onChange={setZ} display={z.toFixed(1)} />
        <Slider label="min move %" value={minPct} min={0} max={40} step={0.5} onChange={setMinPct} display={`${minPct.toFixed(1)}%`} />
        <Slider label="window (samples)" value={window} min={50} max={800} step={10} onChange={setWindow} display={String(window)} />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-foreground">Would fire</span>
          <span className={`font-mono text-2xl tabular-nums ${totalTone}`}>{totalFires}</span>
          <span className="text-xs text-muted-foreground">across {metrics.length} metrics</span>
        </div>
      </div>

      {withFps.length > 0 ? (
        <Alert>
          <AlertTitle>Learn from dismissals</AlertTitle>
          <AlertDescription>
            {withFps.length} metric{withFps.length > 1 ? 's have' : ' has'} produced false positives. Applying the suggested z below would silence those past fires.
          </AlertDescription>
        </Alert>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead className="text-right">Samples</TableHead>
            <TableHead className="text-right">Would fire</TableHead>
            <TableHead className="text-right">False positives</TableHead>
            <TableHead>Saved override</TableHead>
            <TableHead>Suggestion</TableHead>
            <TableHead>Apply</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.metricKey}>
              <TableCell className="align-middle font-mono">{r.metricKey}</TableCell>
              <TableCell className="text-right align-middle font-mono tabular-nums">{r.values.length}</TableCell>
              <TableCell className={`text-right align-middle font-mono tabular-nums ${r.fires > 10 ? 'text-(--critical)' : r.fires === 0 ? 'text-(--good)' : ''}`}>
                {r.values.length <= MIN_SAMPLES ? 'low data' : r.fires}
              </TableCell>
              <TableCell className={`text-right align-middle font-mono tabular-nums ${r.fpCount > 0 ? 'text-(--critical)' : ''}`}>
                {r.fpCount || 'n/a'}
              </TableCell>
              <TableCell className="align-middle">
                {r.savedZ != null || r.savedMinPct != null
                  ? <span className="font-mono tabular-nums">z={r.savedZ ?? 'def'} · {r.savedMinPct ?? 'def'}%</span>
                  : <span className="text-muted-foreground">defaults</span>}
              </TableCell>
              <TableCell className="align-middle">
                {r.suggested != null ? (
                  <form action={setBaselineThreshold}>
                    <input type="hidden" name="metricKey" value={r.metricKey} />
                    <input type="hidden" name="z" value={r.suggested} />
                    <input type="hidden" name="minPct" value={minPct} />
                    <input type="hidden" name="enabled" value="true" />
                    <Button type="submit" size="sm" title={`Raise z to ${r.suggested} to suppress the ${r.fpCount} false positive(s)`}>Apply z={r.suggested}</Button>
                  </form>
                ) : <span className="text-muted-foreground">n/a</span>}
              </TableCell>
              <TableCell className="align-middle">
                <form action={setBaselineThreshold}>
                  <input type="hidden" name="metricKey" value={r.metricKey} />
                  <input type="hidden" name="z" value={z} />
                  <input type="hidden" name="minPct" value={minPct} />
                  <input type="hidden" name="enabled" value="true" />
                  <Button type="submit" variant="outline" size="sm" title={`Save z=${z.toFixed(1)}, min=${minPct.toFixed(1)}% for this metric`}>Apply slider</Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="max-w-[72ch] text-sm text-muted-foreground">
        Drag to preview, then apply to save that metric&rsquo;s z and min move override. The window is a preview control only, since the live runner uses its configured window. Saved overrides take effect on the next analyze run.
      </p>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, display }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string }) {
  return (
    <Field>
      <FieldLabel className="justify-between text-xs font-medium text-foreground">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{display}</span>
      </FieldLabel>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </Field>
  );
}
