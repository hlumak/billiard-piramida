import {
  Ban,
  CalendarRange,
  ChartColumn,
  Coffee,
  LayoutDashboard,
  List,
  Newspaper,
  SlidersHorizontal,
  Trophy,
  Users,
  type LucideIcon
} from 'lucide-react';
import { m } from '../../paraglide/messages.js';

export type AdminGroup = 'daily' | 'club' | 'reports';

export const ADMIN_GROUPS: { id: AdminGroup; label: () => string }[] = [
  { id: 'daily', label: m.admin_group_daily },
  { id: 'club', label: m.admin_group_club },
  { id: 'reports', label: m.admin_group_reports }
];

/**
 * The panel's sections, in the sidebar's order: what the desk does every
 * day, what describes the club, and the reports. `phone` marks the three
 * that get a slot of their own in a phone's bottom bar; the rest sit behind
 * "More" there.
 */
export const ADMIN_PANES = [
  {
    id: 'overview',
    group: 'daily',
    icon: LayoutDashboard,
    label: m.admin_tab_overview,
    phone: true
  },
  { id: 'schedule', group: 'daily', icon: CalendarRange, label: m.admin_tab_schedule, phone: true },
  { id: 'bookings', group: 'daily', icon: List, label: m.admin_tab_bookings, phone: true },
  { id: 'customers', group: 'daily', icon: Users, label: m.admin_tab_customers, phone: false },
  { id: 'blacklist', group: 'daily', icon: Ban, label: m.admin_tab_blacklist, phone: false },
  { id: 'menu', group: 'club', icon: Coffee, label: m.admin_tab_menu, phone: false },
  { id: 'news', group: 'club', icon: Newspaper, label: m.admin_tab_news, phone: false },
  { id: 'tournaments', group: 'club', icon: Trophy, label: m.admin_tab_tournaments, phone: false },
  { id: 'stats', group: 'reports', icon: ChartColumn, label: m.admin_tab_stats, phone: false },
  {
    id: 'settings',
    group: 'reports',
    icon: SlidersHorizontal,
    label: m.admin_tab_settings,
    phone: false
  }
] as const satisfies readonly {
  id: string;
  group: AdminGroup;
  icon: LucideIcon;
  label: () => string;
  phone: boolean;
}[];

export type AdminPaneId = (typeof ADMIN_PANES)[number]['id'];
