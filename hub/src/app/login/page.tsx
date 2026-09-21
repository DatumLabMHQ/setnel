import Link from 'next/link';
import { currentUser } from '@/lib/users';
import { emailConfigured } from '@/lib/notify';
import { login, requestMagicLink } from './actions';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react/ssr';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await currentUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Datum Labs" width={44} height={44} className="rounded-lg" />
            <div>
              <div className="font-heading text-lg font-semibold tracking-tight">Setnel</div>
              <div className="text-xs text-muted-foreground">Risk monitoring by Datum Labs</div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            The console watches every Datum Labs dashboard for anomalies, data gaps, and correlated risk, and pages the on-call before it becomes an incident.
          </p>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {me ? (
            <div className="rounded-lg bg-accent px-3 py-2 text-sm">
              Signed in as <b>{me.name}</b>. <Link href="/setnel" className="font-medium underline underline-offset-4 hover:text-primary">Go to the console</Link>
              <div className="mt-1 text-xs text-muted-foreground">Not you? Sign in with a different email below.</div>
            </div>
          ) : null}

          {sp.sent ? (
            <div className="flex items-start gap-2 rounded-lg bg-(--good-soft) px-3 py-2 text-sm text-(--good)">
              <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
              Check your inbox, a sign-in link is on its way. It expires in 20 minutes.
            </div>
          ) : null}
          {sp.denied ? (
            <div className="flex items-start gap-2 rounded-lg bg-(--critical-soft) px-3 py-2 text-sm text-(--critical)">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
              That email is not on the allow-list. Ask an Owner to add you in Settings, Team.
            </div>
          ) : null}
          {sp.error === 'expired' ? (
            <div className="flex items-start gap-2 rounded-lg bg-(--critical-soft) px-3 py-2 text-sm text-(--critical)">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
              That link expired or was already used. Request a fresh one.
            </div>
          ) : null}
          {sp.link ? (
            <div className="rounded-lg bg-(--info-soft) px-3 py-2 text-sm text-(--info)">
              Email is not configured yet, so here is your one-time sign-in link:
              <a href={sp.link} className="mt-1.5 block break-all font-medium underline underline-offset-4">{sp.link}</a>
            </div>
          ) : null}

          <form action={requestMagicLink} className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="email">Sign in with your work email</FieldLabel>
              <div className="flex gap-2">
                <Input id="email" type="email" name="email" placeholder="you@datumlab.xyz" required autoFocus />
                <Button type="submit" className="shrink-0">{emailConfigured() ? 'Email me a link' : 'Get link'}</Button>
              </div>
              <FieldDescription>Only whitelisted teammates can enter. You get a magic link, no password.</FieldDescription>
            </Field>
          </form>

          <details className="border-t pt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground select-none">Team access (admin)</summary>
            <div className="mt-3 flex flex-col gap-3">
              {sp.error === '1' ? (
                <div className="flex items-start gap-2 rounded-lg bg-(--critical-soft) px-3 py-2 text-sm text-(--critical)">
                  <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
                  Wrong password.
                </div>
              ) : null}
              <form action={login} className="flex flex-col gap-2">
                <FieldLabel htmlFor="password" className="sr-only">Shared team password</FieldLabel>
                <div className="flex gap-2">
                  <Input id="password" type="password" name="password" placeholder="Shared team password" />
                  <Button type="submit" variant="outline" className="shrink-0">Enter</Button>
                </div>
              </form>
              <p className="text-xs text-muted-foreground">Break-glass fallback. Actions taken this way are attributed to team, not a person.</p>
            </div>
          </details>
        </CardContent>
      </Card>
      <div className="text-xs text-muted-foreground">Setnel, internal. © Datum Labs.</div>
    </main>
  );
}
