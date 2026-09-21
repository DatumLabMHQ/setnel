// The frame every Setnel app page shares: the kit's inset Sidebar with Setnel's nav, a slim header,
// and a footer. The auth gate stays here: an unauthenticated visitor never reaches the shell.
import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) redirect('/login');

  return (
    <SidebarProvider style={{ '--sidebar-width': 'calc(var(--spacing) * 64)', '--header-height': 'calc(var(--spacing) * 12)' } as React.CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div data-slot="page" className="mx-auto flex w-full max-w-(--max) flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">{children}</div>
          </div>
          <SiteFooter />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
