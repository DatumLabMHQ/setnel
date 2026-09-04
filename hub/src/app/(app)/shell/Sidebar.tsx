'use client';

import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, LayoutGrid, Activity, Grid3x3, History, Flame,
  BarChart3, BookOpen, SlidersHorizontal, BellRing, Settings, Inbox, PenLine,
  type LucideIcon,
} from 'lucide-react';

type Item = { href: string; icon: LucideIcon; label: string; exact?: boolean };
const NAV: { section: string; items: Item[] }[] = [
  { section: 'Monitor', items: [
    { href: '/setnel', icon: LayoutDashboard, label: 'Console', exact: true },
    { href: '/setnel/incidents', icon: Flame, label: 'Incidents' },
    { href: '/setnel/content', icon: PenLine, label: 'Content' },
    { href: '/setnel/dashboards', icon: LayoutGrid, label: 'Dashboards' },
    { href: '/setnel/metrics', icon: Activity, label: 'Metrics' },
  ] },
  { section: 'Analyze', items: [
    { href: '/setnel/coverage', icon: Grid3x3, label: 'Coverage' },
    { href: '/setnel/backtest', icon: History, label: 'Backtest' },
    { href: '/setnel/reports', icon: BarChart3, label: 'Reports' },
  ] },
  { section: 'Respond', items: [
    { href: '/setnel/runbooks', icon: BookOpen, label: 'Runbooks' },
    { href: '/setnel/inbox', icon: Inbox, label: 'Inbox' },
  ] },
  { section: 'Configure', items: [
    { href: '/setnel/detectors', icon: SlidersHorizontal, label: 'Detectors' },
    { href: '/setnel/escalation', icon: BellRing, label: 'Escalation' },
    { href: '/setnel/settings', icon: Settings, label: 'Settings' },
  ] },
];

export function Sidebar({ activeCount }: { activeCount: number }) {
  const path = usePathname();
  const isActive = (it: Item) => {
    if (it.exact) return path === it.href; // Console highlights only at the root
    if (it.href === '/setnel/incidents') return path.startsWith('/setnel/incidents') || path.startsWith('/setnel/incident/');
    return path === it.href || path.startsWith(it.href + '/');
  };
  return (
    <aside className="sidebar">
      <a href="/setnel" className="sb-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" width={26} height={26} alt="Datum Labs" />
        <span className="sb-brand-text"><b>Setnel</b><i>Datum Labs</i></span>
      </a>
      <nav className="sb-nav">
        {NAV.map((sec) => (
          <div className="sb-section" key={sec.section}>
            <div className="sb-label">{sec.section}</div>
            {sec.items.map((it) => {
              const Icon = it.icon;
              return (
                <a key={it.href} href={it.href} className={`navitem ${isActive(it) ? 'navitem-on' : ''}`}>
                  <Icon size={16} strokeWidth={1.6} />
                  <span>{it.label}</span>
                  {it.href === '/setnel/incidents' && activeCount > 0 ? <span className="navitem-count">{activeCount}</span> : null}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sb-footer">
        <form action="/login/logout" method="post"><button className="ghost-btn" style={{ width: '100%' }} type="submit">Sign out</button></form>
      </div>
    </aside>
  );
}
