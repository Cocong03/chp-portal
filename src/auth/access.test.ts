import { SECTIONS, type SectionKey } from '@/layout/sections'
import { canSee, hasBusinessRole } from './access'

const visible = (roles: string[]) => SECTIONS.filter((s) => canSee(roles, s.key)).map((s) => s.key)

test.each<[string, SectionKey[]]>([
  ['Full Access', ['dashboard', 'sites', 'orders', 'ledger', 'documents', 'requests', 'complaints', 'account']],
  ['Orders & Delivery', ['dashboard', 'sites', 'orders', 'requests', 'account']],
  ['Finance & Documents', ['dashboard', 'ledger', 'documents', 'account']],
  ['View Only', ['dashboard', 'account']],
])('%s sees exactly its sections, in nav order', (role, expected) => {
  expect(visible(['Authenticated Users', role])).toEqual(expected)
})

test('several roles see the union of their sections', () => {
  expect(visible(['View Only', 'Finance & Documents'])).toEqual(['dashboard', 'ledger', 'documents', 'account'])
})

test('non-business roles see nothing and do not count as a business role', () => {
  const roles = ['Authenticated Users', 'Administrators', 'constructor']
  expect(visible(roles)).toEqual([])
  expect(hasBusinessRole(roles)).toBe(false)
})

test('any one business role counts', () => {
  expect(hasBusinessRole(['Authenticated Users', 'View Only'])).toBe(true)
})

test('nav follows the wireframe order and labels', () => {
  expect(SECTIONS.map((s) => [s.label, s.path])).toEqual([
    ['Dashboard', '/'],
    ['Delivery Sites', '/sites'],
    ['Orders', '/orders'],
    ['Customer Ledger', '/ledger'],
    ['Document Center', '/documents'],
    ['Requests', '/requests'],
    ['Complaints & Feedback', '/complaints'],
    ['Account and User Management', '/account'],
  ])
})
