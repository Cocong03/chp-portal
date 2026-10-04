import type { SectionKey } from '@/layout/sections'

// Wireframe PORTAL_ROLE_PAGES, plus Account for every role (Q6 recommendation, pending Rene).
// A Map, so role names like "constructor" never hit Object.prototype.
const ROLE_SECTIONS = new Map<string, SectionKey[]>([
  ['Full Access', ['dashboard', 'orders', 'ledger', 'documents', 'sites', 'complaints', 'requests', 'account']],
  ['Orders & Delivery', ['dashboard', 'orders', 'sites', 'requests', 'account']],
  ['Finance & Documents', ['dashboard', 'ledger', 'documents', 'account']],
  ['View Only', ['dashboard', 'account']],
])

/** UX only. Server Logic web roles and table permissions are the security. */
export function canSee(roles: string[], section: SectionKey): boolean {
  return roles.some((role) => ROLE_SECTIONS.get(role)?.includes(section) ?? false)
}

export function hasBusinessRole(roles: string[]): boolean {
  return roles.some((role) => ROLE_SECTIONS.has(role))
}
