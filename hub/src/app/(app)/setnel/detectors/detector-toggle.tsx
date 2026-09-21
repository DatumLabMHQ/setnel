'use client';

import { useOptimistic, useTransition } from 'react';
import { Switch } from '@/components/ui/switch';
import { setDetectorEnabled } from '../config-actions';

// Optimistic enable/disable: the switch flips instantly, the server action runs
// in the background, and revalidation reconciles. No full-page stall per toggle.
export function DetectorToggle({ dashboardId, detectorId, enabled }: { dashboardId: string; detectorId: string; enabled: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [pending, start] = useTransition();

  return (
    <label className="inline-flex items-center gap-2">
      <Switch
        checked={optimistic}
        disabled={pending}
        onCheckedChange={(checked) =>
          start(async () => {
            setOptimistic(checked);
            const fd = new FormData();
            fd.set('dashboardId', dashboardId);
            fd.set('detectorId', detectorId);
            fd.set('enabled', String(checked));
            await setDetectorEnabled(fd);
          })
        }
      />
      <span className="text-xs text-muted-foreground">{optimistic ? 'enabled' : 'disabled'}</span>
    </label>
  );
}
