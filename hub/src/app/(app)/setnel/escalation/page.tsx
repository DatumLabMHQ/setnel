import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { getEscalation, getRecentEscalations, getChannels, getRotation, getCurrentOnCall } from '@/lib/admin';
import { fmtTime } from '@/lib/format';
import { saveEscalation, saveChannel, saveRotation } from '../config-actions';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { CheckCircleIcon, WarningCircleIcon, UserCircleIcon, BellRingingIcon } from '@phosphor-icons/react/ssr';

export const dynamic = 'force-dynamic';

const sevClass: Record<string, string> = {
  info: 'bg-(--info-soft) text-(--info) border-transparent',
  warning: 'bg-(--warning-soft) text-(--warning) border-transparent',
  critical: 'bg-(--critical-soft) text-(--critical) border-transparent',
  emergency: 'bg-(--emergency-soft) text-(--emergency) border-transparent',
};

function SevBadge({ severity }: { severity: string }) {
  return <Badge className={sevClass[severity] ?? 'bg-muted text-muted-foreground border-transparent'}>{severity}</Badge>;
}

export default async function EscalationPage() {
  if (!(await isAuthed())) redirect('/login');
  const [esc, recent, channels, rotation, onCall] = await Promise.all([
    getEscalation(), getRecentEscalations(), getChannels(), getRotation(), getCurrentOnCall(),
  ]);
  const telegramOk = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  const emailOk = Boolean(process.env.ONCHAINSUITE_SECRET_KEY) || Boolean(process.env.RESEND_API_KEY && process.env.SETNEL_EMAIL_FROM);
  const rosterText = rotation.map((r) => (r.contact ? `${r.member} <${r.contact}>` : r.member)).join('\n');

  return (
    <>
      <PageHeader
        eyebrow="Escalation"
        question="Who gets paged when nobody acks?"
        answer="The current on-call, the weekly rotation, the escalation window, and where each severity is delivered. Acknowledging or muting an incident stops its escalation."
      />

      {/* On-call now, at a glance. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className={onCall.name ? '' : 'ring-(--warning)/40'}>
          <CardHeader className="gap-1 pb-0">
            <CardDescription className="flex items-center gap-1.5">
              <UserCircleIcon className="size-4" /> Current on-call
            </CardDescription>
            <CardTitle className={`text-xl ${onCall.name ? 'text-(--good)' : 'text-(--warning)'}`}>{onCall.name ?? 'nobody set'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-1 text-xs text-muted-foreground">
            {onCall.contact ?? (onCall.name ? 'no contact' : 'set a rotation or static on-call below')}
            <span className="mt-1 block">{onCall.rotating ? 'from the weekly rotation' : 'static on-call, no rotation set'}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-1 pb-0">
            <CardDescription>Rotation</CardDescription>
            <CardTitle className="font-mono text-2xl tabular-nums">{rotation.length || 'n/a'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-1 text-xs text-muted-foreground">people, weekly handoff</CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-1 pb-0">
            <CardDescription>Delivery</CardDescription>
            <CardTitle className="text-lg">Telegram{emailOk ? ' and email' : ''}</CardTitle>
          </CardHeader>
          <CardContent className="pt-1 text-xs text-muted-foreground">no phone or SMS paging yet</CardContent>
        </Card>
      </section>

      {/* On-call rotation. */}
      <Card>
        <CardHeader>
          <CardTitle>On-call rotation</CardTitle>
          <CardDescription>One person per line as <code className="font-mono">Name &lt;contact&gt;</code>. The list rotates weekly.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveRotation} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="roster">Roster</FieldLabel>
              <Textarea
                id="roster"
                name="roster"
                rows={Math.max(4, rotation.length + 1)}
                defaultValue={rosterText}
                placeholder={'Olusegun <@olusegun>\nAda <ada@datumlab.xyz>'}
                className="font-mono text-sm"
              />
              <FieldDescription>
                An empty rotation falls back to the static on-call below. This rotates who is named on the page. Delivery is still Telegram or email to the team channel, not a personal phone call.
              </FieldDescription>
            </Field>
            <div>
              <Button type="submit">Save rotation</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Escalation policy. */}
      <Card>
        <CardHeader>
          <CardTitle>Escalation policy</CardTitle>
          <CardDescription>
            When a critical or emergency incident stays unacknowledged past the window, Setnel re-pages tagged escalation with the current on-call.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveEscalation} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="minutes">Escalate after (minutes)</FieldLabel>
                <Input id="minutes" name="minutes" type="number" min="1" max="1440" defaultValue={esc.escalateAfterMin} />
              </Field>
              <Field>
                <FieldLabel htmlFor="oncallName">On-call name</FieldLabel>
                <Input id="oncallName" name="oncallName" maxLength={80} defaultValue={esc.oncallName ?? ''} placeholder="e.g. Olusegun" />
              </Field>
              <Field>
                <FieldLabel htmlFor="oncallContact">On-call contact</FieldLabel>
                <Input id="oncallContact" name="oncallContact" maxLength={120} defaultValue={esc.oncallContact ?? ''} placeholder="@handle or phone" />
              </Field>
              <Field>
                <FieldLabel htmlFor="enabled">Escalation</FieldLabel>
                <NativeSelect id="enabled" name="enabled" defaultValue={String(esc.enabled)} className="w-full">
                  <NativeSelectOption value="true">enabled</NativeSelectOption>
                  <NativeSelectOption value="false">paused</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field className="sm:col-span-2 lg:col-span-4">
                <FieldLabel htmlFor="emailRecipients">Email recipients</FieldLabel>
                <Input id="emailRecipients" name="emailRecipients" maxLength={500} defaultValue={esc.emailRecipients ?? ''} placeholder="oncall@datumlab.xyz, lead@datumlab.xyz" />
                <FieldDescription>Comma or space separated.</FieldDescription>
              </Field>
            </div>
            <div>
              <Button type="submit">Save escalation policy</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Notification channels. */}
      <Card>
        <CardHeader>
          <CardTitle>Notification channels</CardTitle>
          <CardDescription>Where each severity is delivered. Info never pages, and Telegram stays the reliable default.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className={`inline-flex items-center gap-1.5 ${telegramOk ? 'text-(--good)' : 'text-(--critical)'}`}>
              {telegramOk ? <CheckCircleIcon className="size-4" /> : <WarningCircleIcon className="size-4" />}
              Telegram {telegramOk ? 'connected' : 'not configured'}
            </span>
            <span className={`inline-flex items-center gap-1.5 ${emailOk ? 'text-(--good)' : 'text-(--critical)'}`}>
              {emailOk ? <CheckCircleIcon className="size-4" /> : <WarningCircleIcon className="size-4" />}
              Email {emailOk ? (process.env.ONCHAINSUITE_SECRET_KEY ? 'via Onchain Suite' : 'via Resend') : 'needs ONCHAINSUITE_SECRET_KEY'}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Delivery</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((c) => (
                <TableRow key={c.severity}>
                  <TableCell><SevBadge severity={c.severity} /></TableCell>
                  <TableCell>
                    <form action={saveChannel} className="flex flex-wrap items-center gap-4">
                      <input type="hidden" name="severity" value={c.severity} />
                      <label htmlFor={`telegram-${c.severity}`} className="flex items-center gap-2 text-sm">
                        <input id={`telegram-${c.severity}`} type="checkbox" name="telegram" defaultChecked={c.telegram} className="size-4 accent-primary" /> Telegram
                      </label>
                      <label htmlFor={`email-${c.severity}`} className="flex items-center gap-2 text-sm">
                        <input id={`email-${c.severity}`} type="checkbox" name="email" defaultChecked={c.email} className="size-4 accent-primary" /> Email
                      </label>
                      <Button type="submit" variant="outline" size="sm">Save</Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm text-muted-foreground">
            If a severity has email on but no provider key is set, the send is skipped and dead-lettered.
          </p>
        </CardContent>
      </Card>

      {/* Recent escalations. */}
      <Card>
        <CardHeader>
          <CardTitle>Recent escalations</CardTitle>
          <CardDescription>The last {recent.length} incidents paged past the window. Incidents acknowledged in time never reach here.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <Empty>
              <EmptyMedia variant="icon"><BellRingingIcon /></EmptyMedia>
              <EmptyTitle>No escalations yet</EmptyTitle>
              <EmptyDescription>Incidents that get acknowledged in time never reach here. Tune the window above if the team needs longer to respond.</EmptyDescription>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{fmtTime(r.escalated_at)}</span>
                  <SevBadge severity={r.severity} />
                  <span className="font-medium">{r.dashboard_name}</span>
                  <Link href={`/setnel/incident/${r.id}`} className="text-muted-foreground underline underline-offset-4 hover:text-primary">{r.message}</Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
