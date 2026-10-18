/**
 * Menu beranda per peran (peran dikirim server saat login).
 */
import type { Role } from '../../sync/contract';
import type { TranslationKey } from '../../i18n/id';

export type MenuKey =
  | 'attendance'
  | 'assignment'
  | 'harvest'
  | 'transport'
  | 'upkeep'
  | 'approval'
  | 'daily_report'
  | 'sync';

export interface MenuItem {
  key: MenuKey;
  label: TranslationKey;
  /** Nama ikon MaterialCommunityIcons. */
  icon: string;
  roles: readonly Role[] | 'all';
  /** Tahap pengembangan saat modul tersedia. */
  stage: number;
  /** Rute layar modul bila sudah tersedia. */
  route?: '/attendance' | '/assignment' | '/sync';
}

export const MENU: readonly MenuItem[] = [
  { key: 'attendance', icon: 'account-check', label: 'menu.attendance', roles: ['mandor_panen', 'mandor_rawat', 'kerani_panen'], stage: 4, route: '/attendance' },
  { key: 'assignment', icon: 'clipboard-account', label: 'menu.assignment', roles: ['mandor_panen', 'mandor_rawat'], stage: 4, route: '/assignment' },
  { key: 'harvest', icon: 'palm-tree', label: 'menu.harvest', roles: ['mandor_panen', 'kerani_panen'], stage: 5 },
  { key: 'transport', icon: 'truck', label: 'menu.transport', roles: ['kerani_transport'], stage: 6 },
  { key: 'upkeep', icon: 'sprout', label: 'menu.upkeep', roles: ['mandor_rawat'], stage: 7 },
  { key: 'approval', icon: 'check-decagram', label: 'menu.approval', roles: ['asisten'], stage: 8 },
  { key: 'daily_report', icon: 'file-document-edit', label: 'menu.dailyReport', roles: ['mandor_panen', 'mandor_rawat', 'asisten'], stage: 8 },
  { key: 'sync', icon: 'sync', label: 'menu.sync', roles: 'all', stage: 3, route: '/sync' },
];

export function menuForRoles(roles: readonly Role[]): MenuItem[] {
  return MENU.filter((m) => m.roles === 'all' || m.roles.some((r) => roles.includes(r)));
}

export function canAccess(key: MenuKey, roles: readonly Role[]): boolean {
  return menuForRoles(roles).some((m) => m.key === key);
}
