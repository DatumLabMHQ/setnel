// The one file that names Setnel, its navigation and its external links. The shell, the command
// palette and the page metadata all read from here. Everything else is a page or a component.
import type { NavEntry, NavLink } from '@/lib/nav';

// Declared with their types (not inline) so the sidebar and palette always see the wide NavEntry
// shape, even for entries with no children (see docs/SHADCN.md: `satisfies` narrows a config literal).
const NAV: NavEntry[] = [
  { href: '/setnel', label: 'Console', icon: 'home' },
  {
    href: '/setnel/incidents', label: 'Incidents', icon: 'flame',
    children: [{ href: '/setnel/inbox', label: 'Inbox' }],
  },
  { href: '/setnel/detectors', label: 'Detectors', icon: 'shield' },
  {
    href: '/setnel/dashboards', label: 'Dashboards', icon: 'squares',
    children: [
      { href: '/setnel/metrics', label: 'Metrics' },
      { href: '/setnel/coverage', label: 'Coverage' },
    ],
  },
  {
    href: '/setnel/reports', label: 'Reports', icon: 'chart',
    children: [{ href: '/setnel/backtest', label: 'Backtest' }],
  },
  { href: '/setnel/content', label: 'Content', icon: 'sparkle' },
  { href: '/setnel/runbooks', label: 'Runbooks', icon: 'book' },
  { href: '/setnel/escalation', label: 'Escalation', icon: 'bell' },
  { href: '/setnel/settings', label: 'Settings', icon: 'gear' },
];

const LINKS: NavLink[] = [
  { href: 'https://www.datumlab.xyz', label: 'datumlab.xyz' },
  { href: 'https://github.com/DatumLabMHQ/setnel', label: 'Setnel on GitHub' },
];

export const site = {
  name: 'Setnel',
  description: 'Risk monitoring for DeFi lending dashboards. A Datum Labs product.',
  owner: 'Datum Labs',
  nav: NAV,
  links: LINKS,
  footnote: 'Built on the Datum UI kit: shadcn/ui components, Datum tokens, Phosphor icons.',
};
export type Site = typeof site;
