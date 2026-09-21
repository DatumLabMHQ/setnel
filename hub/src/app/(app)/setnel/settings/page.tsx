import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { isAuthed } from '@/lib/session';
import { getDashboardsAdmin, getSloTargets, getHeartbeats } from '@/lib/admin';
import { getUsersWithActivity, USER_ROLES } from '@/lib/users';
import { emailConfigured } from '@/lib/notify';
import { timeAgo } from '@/lib/format';
import { addDashboard, setDashboardEnabled, savePreferences, addUser, updateUserRole, removeUser, saveSlo } from '../config-actions';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { CheckCircleIcon, WarningCircleIcon, UsersIcon, HeartbeatIcon } from '@phosphor-icons/react/ssr';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  if (!(await isAuthed())) redirect('/login');
  const [dashboards, users, slo, heartbeats, jar] = await Promise.all([
    getDashboardsAdmin(), getUsersWithActivity(), getSloTargets(), getHeartbeats(), cookies(),
  ]);

  let prefs = { density: 'comfortable', timeRange: '30', colorblind: false };
  try { prefs = { ...prefs, ...JSON.parse(jar.get('setnel_prefs')?.value ?? '{}') }; } catch { /* default */ }

  const integrations = [
    { name: 'Telegram alerts', ok: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID), note: 'incident and escalation paging' },
    { name: 'Email (Resend)', ok: emailConfigured(), note: 'magic-link login, per-severity email, weekly digest' },
    { name: 'Cron ingest secret', ok: Boolean(process.env.SETNEL_CRON_SECRET), note: 'authenticates GitHub Actions runs' },
    { name: 'Database', ok: Boolean(process.env.DATABASE_URL), note: 'Neon Postgres store' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        question="How is Setnel wired up?"
        answer="Team and access, the service-level targets your response is measured against, the health of Setnel's own jobs, the dashboards it watches, and how alerts are delivered."
      />

      {/* Team & access. */}
      <Card>
        <CardHeader>
          <CardTitle>Team and access</CardTitle>
          <CardDescription>{users.length} users. Roles are attribution today, enforcement lands with SSO.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {users.length === 0 ? (
            <Empty>
              <EmptyMedia variant="icon"><UsersIcon /></EmptyMedia>
              <EmptyTitle>No users yet</EmptyTitle>
              <EmptyDescription>Add one below, then they sign in via <Link href="/login">magic link</Link> to get verified attribution.</EmptyDescription>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <form action={updateUserRole} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <NativeSelect name="role" defaultValue={u.role} size="sm" aria-label={`Role for ${u.name}`}>
                          {USER_ROLES.map((r) => <NativeSelectOption key={r} value={r}>{r}</NativeSelectOption>)}
                        </NativeSelect>
                        <Button type="submit" variant="ghost" size="sm">Set</Button>
                      </form>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{u.actions}</TableCell>
                    <TableCell className="text-muted-foreground">{u.lastLogin ? timeAgo(u.lastLogin) : 'never'}</TableCell>
                    <TableCell>
                      <form action={removeUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <Button type="submit" variant="ghost" size="sm">Remove</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex flex-col gap-3 border-t pt-4">
            <h3 className="font-heading text-sm font-medium">Add user</h3>
            <form action={addUser} className="flex flex-wrap items-end gap-3">
              <Field className="w-full sm:w-44">
                <FieldLabel htmlFor="user-name">Full name</FieldLabel>
                <Input id="user-name" name="name" placeholder="Full name" maxLength={80} required />
              </Field>
              <Field className="w-full sm:w-56">
                <FieldLabel htmlFor="user-email">Email</FieldLabel>
                <Input id="user-email" name="email" type="email" placeholder="email@datumlab.xyz" required />
              </Field>
              <Field className="w-full sm:w-32">
                <FieldLabel htmlFor="user-role">Role</FieldLabel>
                <NativeSelect id="user-role" name="role" defaultValue="Responder" className="w-full">
                  {USER_ROLES.map((r) => <NativeSelectOption key={r} value={r}>{r}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Button type="submit">Add user</Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Service-level targets. */}
      <Card>
        <CardHeader>
          <CardTitle>Service-level targets</CardTitle>
          <CardDescription>The goals your response metrics are measured against.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveSlo} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="mtta">Ack within (min)</FieldLabel>
                <Input id="mtta" name="mtta" type="number" min="1" defaultValue={slo.mttaTargetMin} />
              </Field>
              <Field>
                <FieldLabel htmlFor="mttr">Resolve within (min)</FieldLabel>
                <Input id="mttr" name="mttr" type="number" min="1" defaultValue={slo.mttrTargetMin} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ackRate">Ack rate target (%)</FieldLabel>
                <Input id="ackRate" name="ackRate" type="number" min="0" max="100" defaultValue={slo.ackRateTarget} />
              </Field>
              <Field>
                <FieldLabel htmlFor="fpRate">False-positive ceiling (%)</FieldLabel>
                <Input id="fpRate" name="fpRate" type="number" min="0" max="100" defaultValue={slo.fpRateTarget} />
              </Field>
            </div>
            <div>
              <Button type="submit">Save targets</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* System health. */}
      <Card>
        <CardHeader>
          <CardTitle>System health</CardTitle>
          <CardDescription>Setnel monitoring itself. A job is stale past roughly 3 times its interval.</CardDescription>
        </CardHeader>
        <CardContent>
          {heartbeats.length === 0 ? (
            <Empty>
              <EmptyMedia variant="icon"><HeartbeatIcon /></EmptyMedia>
              <EmptyTitle>No cron heartbeats yet</EmptyTitle>
              <EmptyDescription>They appear after the next scheduled run.</EmptyDescription>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Every</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heartbeats.map((h) => (
                  <TableRow key={h.job}>
                    <TableCell className="font-medium">{h.job}</TableCell>
                    <TableCell className="font-mono tabular-nums">{h.expectedMin}m</TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(h.lastRunAt)}</TableCell>
                    <TableCell className="font-mono tabular-nums">{h.runs}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 ${h.stale ? 'text-(--critical)' : 'text-(--good)'}`}>
                        {h.stale ? <WarningCircleIcon className="size-4" /> : <CheckCircleIcon className="size-4" />}
                        {h.stale ? 'stale' : 'healthy'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dashboards registry. */}
      <Card>
        <CardHeader>
          <CardTitle>Dashboards registry</CardTitle>
          <CardDescription>{dashboards.length} onboarded surfaces. Each also needs a per-dashboard ingest secret and detector code.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboards.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/setnel/dashboards/${d.id}`} className="font-mono underline underline-offset-4 hover:text-primary">{d.id}</Link>
                  </TableCell>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>
                    <a href={d.baseUrl} target="_blank" rel="noreferrer" className="text-muted-foreground underline underline-offset-4 hover:text-primary">{d.baseUrl.replace(/^https?:\/\//, '')}</a>
                  </TableCell>
                  <TableCell>
                    <form action={setDashboardEnabled}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="enabled" value={d.enabled ? 'false' : 'true'} />
                      <Button type="submit" variant={d.enabled ? 'outline' : 'default'} size="sm">{d.enabled ? 'Enabled' : 'Paused'}</Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t pt-4">
            <h3 className="font-heading text-sm font-medium">Onboard a dashboard</h3>
            <form action={addDashboard} className="flex flex-wrap items-end gap-3">
              <Field className="w-full sm:w-40">
                <FieldLabel htmlFor="dash-id">ID</FieldLabel>
                <Input id="dash-id" name="id" placeholder="id (e.g. sparklend)" maxLength={40} required />
              </Field>
              <Field className="w-full sm:w-44">
                <FieldLabel htmlFor="dash-name">Display name</FieldLabel>
                <Input id="dash-name" name="name" placeholder="Display name" maxLength={80} required />
              </Field>
              <Field className="w-full sm:w-60">
                <FieldLabel htmlFor="dash-url">Base URL</FieldLabel>
                <Input id="dash-url" name="baseUrl" placeholder="https://dashboard.url" required />
              </Field>
              <Field className="w-full sm:w-44">
                <FieldLabel htmlFor="dash-slug">Protocol slug</FieldLabel>
                <Input id="dash-slug" name="protocolSlug" placeholder="protocol slug (optional)" maxLength={80} />
              </Field>
              <Button type="submit">Add dashboard</Button>
            </form>
            <FieldDescription>Also needs a per-dashboard ingest secret and detector code. See <code className="font-mono">docs/ONBOARD_A_DASHBOARD.md</code>.</FieldDescription>
          </div>
        </CardContent>
      </Card>

      {/* Integrations. */}
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Delivery and storage that Setnel depends on.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integration</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {integrations.map((it) => (
                <TableRow key={it.name}>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="text-muted-foreground">{it.note}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 ${it.ok ? 'text-(--good)' : 'text-(--critical)'}`}>
                      {it.ok ? <CheckCircleIcon className="size-4" /> : <WarningCircleIcon className="size-4" />}
                      {it.ok ? 'connected' : 'not set'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Preferences. */}
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Display only, stored in your browser.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={savePreferences} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="density">Density</FieldLabel>
                <NativeSelect id="density" name="density" defaultValue={prefs.density} className="w-full">
                  <NativeSelectOption value="comfortable">comfortable</NativeSelectOption>
                  <NativeSelectOption value="compact">compact</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="timeRange">Default time range</FieldLabel>
                <NativeSelect id="timeRange" name="timeRange" defaultValue={prefs.timeRange} className="w-full">
                  <NativeSelectOption value="7">7 days</NativeSelectOption>
                  <NativeSelectOption value="14">14 days</NativeSelectOption>
                  <NativeSelectOption value="30">30 days</NativeSelectOption>
                  <NativeSelectOption value="90">90 days</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="colorblind">Colorblind-safe status</FieldLabel>
                <label htmlFor="colorblind" className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <input id="colorblind" type="checkbox" name="colorblind" defaultChecked={prefs.colorblind} className="size-4 accent-primary" />
                  add letters and shapes to status
                </label>
              </Field>
            </div>
            <div>
              <Button type="submit">Save preferences</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
