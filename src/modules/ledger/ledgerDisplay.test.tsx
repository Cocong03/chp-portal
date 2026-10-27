import { render, screen } from '@testing-library/react'
import type { LedgerEntryDto } from '@/api/types'
import { ledgerMock, MOCK_LEDGER } from '@/mocks/ledger'
import { isPastDue, LedgerStatusPill, manilaToday } from './ledgerDisplay'
import { ledgerQuery } from './useLedger'

const entry = (patch: Partial<LedgerEntryDto>): LedgerEntryDto => ({ ...MOCK_LEDGER[0], ...patch })

test("today is the Philippines' date whatever the device's zone", () => {
  expect(manilaToday(new Date('2026-09-13T15:59:00Z'))).toBe('2026-09-13')
  expect(manilaToday(new Date('2026-09-13T16:00:00Z'))).toBe('2026-09-14')
})

test('past due only when something is still owed and the due date is before today', () => {
  expect(isPastDue(entry({ dueDate: '2026-09-13', remaining: 100 }), '2026-09-14')).toBe(true)
  expect(isPastDue(entry({ dueDate: '2026-09-14', remaining: 100 }), '2026-09-14')).toBe(false)
  expect(isPastDue(entry({ dueDate: '2026-09-13', remaining: 0 }), '2026-09-14')).toBe(false)
  expect(isPastDue(entry({ dueDate: '2026-09-13', remaining: -50 }), '2026-09-14')).toBe(false)
  expect(isPastDue(entry({ dueDate: null, remaining: 100 }), '2026-09-14')).toBe(false)
})

test('status pills: Open amber, Closed green', () => {
  render(<><LedgerStatusPill status="Open" /><LedgerStatusPill status="Closed" /></>)
  expect(screen.getByText('Open')).toHaveAttribute('data-tone', 'warn')
  expect(screen.getByText('Closed')).toHaveAttribute('data-tone', 'good')
})

test('the query string leaves out empty filters and page 1', () => {
  expect(ledgerQuery({ q: '', type: '', show: '', from: '', to: '', page: 1 })).toEqual({})
  expect(ledgerQuery({ q: 'INV', type: 'Payment', show: 'all', from: '2026-07-01', to: '', page: 2 }))
    .toEqual({ q: 'INV', type: 'Payment', show: 'all', from: '2026-07-01', page: '2' })
})

test('the dev mock answers like the endpoint: open only by default, newest first, filters and search', () => {
  const open = ledgerMock({ method: 'GET', query: {} })
  expect(open.total).toBe(4)
  expect(open.entries.map((e) => e.docNo)).toEqual(['INV-88611', 'INV-88604', 'INV-88598', 'INV-88532'])
  expect(ledgerMock({ method: 'GET', query: { show: 'all' } }).total).toBe(9)
  expect(ledgerMock({ method: 'GET', query: { show: 'all', type: 'Payment' } }).entries.map((e) => e.docNo)).toEqual(['PMT-20441', 'PMT-20398'])
  expect(ledgerMock({ method: 'GET', query: { show: 'all', q: 'damaged' } }).entries.map((e) => e.docNo)).toEqual(['CM-1042'])
  expect(ledgerMock({ method: 'GET', query: { show: 'all', from: '2026-08-01', to: '2026-08-31' } }).total).toBe(3)
})
