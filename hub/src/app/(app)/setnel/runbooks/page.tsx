import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { allRunbooks } from '@/lib/runbooks';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';

export const dynamic = 'force-dynamic';

export default async function RunbooksPage() {
  if (!(await isAuthed())) redirect('/login');
  const books = allRunbooks();
  return (
    <>
      <PageHeader
        eyebrow="Runbooks"
        question="What do you do when an alert fires?"
        answer="Step by step response for each kind of alert, so anyone on call can act without guessing. Read the trigger, then work the list top to bottom."
      />

      {books.length === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyTitle>No runbooks yet</EmptyTitle>
              <EmptyDescription>Runbooks are defined in code. Add one and it shows up here.</EmptyDescription>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {books.map((b) => (
            <Card key={b.title}>
              <CardHeader>
                <CardTitle>{b.title}</CardTitle>
                <CardDescription>Fires when {b.when}</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm marker:text-muted-foreground marker:tabular-nums">
                  {b.steps.map((s, i) => (
                    <li key={i} className="pl-1 leading-relaxed">{s}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </>
  );
}
