import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { LedgerPageDto } from '@/api/types'
import { MOCK_LEDGER } from '@/mocks/ledger'
import { renderApp } from '@/test/render'
import { LedgerPage } from './LedgerPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
function answerLedger(answer: LedgerPageDto | Error) {
  vi.mocked(serverLogic).mockImplementation(async (name, options) => {
    if (name !== 'ledger') return actualServerLogic(name, options)
    if (answer instanceof Error) throw answer
    return answer as never
  })
}
const lastLedgerQuery = () => vi.mocked(serverLogic).mock.calls.filter(([name]) => name === 'ledger').at(-1)?.[1]?.query
const table = () => screen.findByRole('table', { name: 'Customer ledger' })

afterEach(() => vi.useRealTimers())

test('shows open entries in the wireframe columns with BC amounts, pills and the page title', async () => {
  renderApp(<LedgerPage />, { route: '/ledger' })
  const ledger = await table()
  const row = await within(ledger).findByRole('row', { name: /INV-88611/ })
  expect(within(ledger).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Posting date', 'Document type', 'Document no.', 'Ref PO Number', 'Description', 'Due date', 'Original amount', 'Remaining amount', 'Status',
  ])
  expect(within(row).getByText('Sep 12, 2026')).toBeInTheDocument()
  expect(within(row).getByText('PO-8858')).toBeInTheDocument()
  expect(within(row).getAllByText('₱63,250.00')).toHaveLength(2)
  expect(within(row).getByText('Open')).toHaveAttribute('data-tone', 'warn')
  expect(lastLedgerQuery()).toEqual({})
  expect(screen.getByRole('combobox', { name: 'Show open items or all entries' })).toHaveTextContent('Open items only')
  expect(await screen.findByText('Showing 1–4 of 4 entries')).toBeInTheDocument()
  expect(document.title).toBe('Customer Ledger — Concreat Connect')
  expect(screen.getByRole('note')).toHaveTextContent('Sample data')
})

test('payments and credits show the minus before the peso sign, dashes for no PO or due date, green Closed', async () => {
  const user = userEvent.setup()
  renderApp(<LedgerPage />, { route: '/ledger' })
  await table()
  await user.click(screen.getByRole('combobox', { name: 'Show open items or all entries' }))
  await user.click(await screen.findByRole('option', { name: 'All entries' }))
  await waitFor(() => expect(lastLedgerQuery()).toEqual({ show: 'all' }))
  const row = await within(await table()).findByRole('row', { name: /PMT-20441/ })
  expect(within(row).getByText('-₱320,000.00')).toBeInTheDocument()
  expect(within(row).getAllByText('—')).toHaveLength(2)
  expect(within(row).getByText('Closed')).toHaveAttribute('data-tone', 'good')
})

test("due dates before today in the Philippines are red when still owed; today's is not", async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-13T16:30:00Z')) // Sep 14, 00:30 in Manila
  renderApp(<LedgerPage />, { route: '/ledger' })
  const ledger = await table()
  const overdue = within(await within(ledger).findByRole('row', { name: /INV-88532/ })).getByText('Aug 20, 2026')
  const dueToday = within(within(ledger).getByRole('row', { name: /INV-88598/ })).getByText('Sep 14, 2026')
  expect(overdue).toHaveClass('text-destructive', 'font-semibold')
  expect(dueToday).not.toHaveClass('text-destructive')
})

test('type and date filters write the URL and query BC from page 1', async () => {
  const user = userEvent.setup()
  renderApp(<LedgerPage />, { route: '/ledger?page=2' })
  await table()
  await user.click(screen.getByRole('combobox', { name: 'Filter by document type' }))
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['All document types', 'Invoice', 'Credit Memo', 'Payment'])
  await user.click(screen.getByRole('option', { name: 'Invoice' }))
  await waitFor(() => expect(lastLedgerQuery()).toEqual({ type: 'Invoice' }))
})

test('the URL pre-selects filters', async () => {
  renderApp(<LedgerPage />, { route: '/ledger?show=all&type=Payment&from=2026-07-01' })
  await table()
  await waitFor(() => expect(lastLedgerQuery()).toEqual({ show: 'all', type: 'Payment', from: '2026-07-01' }))
  expect(screen.getByRole('combobox', { name: 'Filter by document type' })).toHaveTextContent('Payment')
  expect(screen.getByRole('button', { name: 'From Jul 1, 2026' })).toBeInTheDocument()
})

test('search waits for typing to stop, then queries BC', async () => {
  const user = userEvent.setup()
  renderApp(<LedgerPage />, { route: '/ledger' })
  await table()
  await user.type(screen.getByRole('searchbox', { name: 'Search ledger entries' }), 'PO-8858')
  await waitFor(() => expect(lastLedgerQuery()).toEqual({ q: 'PO-8858' }))
  expect(vi.mocked(serverLogic).mock.calls.filter(([n, o]) => n === 'ledger' && o?.query?.q === 'PO-885')).toHaveLength(0)
})

test('Clear filters goes back to open items only', async () => {
  const user = userEvent.setup()
  renderApp(<LedgerPage />, { route: '/ledger?show=all&type=Payment' })
  await table()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(lastLedgerQuery()).toEqual({}))
  expect(screen.getByRole('combobox', { name: 'Show open items or all entries' })).toHaveTextContent('Open items only')
})

test('a page past the end jumps back to the last page', async () => {
  renderApp(<LedgerPage />, { route: '/ledger?show=all&page=5' })
  expect(await screen.findByText('Showing 1–9 of 9 entries')).toBeInTheDocument()
  expect(screen.queryByRole('cell', { name: 'No entries match your filters.' })).not.toBeInTheDocument()
  await waitFor(() => expect(lastLedgerQuery()).toEqual({ show: 'all' }))
})

test('an empty ledger says no entries match', async () => {
  answerLedger({ entries: [], total: 0, page: 1, pageSize: 10 })
  renderApp(<LedgerPage />, { route: '/ledger' })
  expect(await screen.findByRole('cell', { name: 'No entries match your filters.' })).toBeInTheDocument()
})

test('a failed load shows the error and Try again reloads', async () => {
  const user = userEvent.setup()
  answerLedger(new ApiError(500, 'x'))
  renderApp(<LedgerPage />, { route: '/ledger' })
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  vi.mocked(serverLogic).mockImplementation(actualServerLogic)
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await within(await table()).findByRole('row', { name: /INV-88611/ })).toBeInTheDocument()
})

test('an entry type BC adds later still shows under its own name', async () => {
  answerLedger({ entries: [{ ...MOCK_LEDGER[0], docNo: 'RF-1', type: 'Refund' }], total: 1, page: 1, pageSize: 10 })
  renderApp(<LedgerPage />, { route: '/ledger' })
  const row = await within(await table()).findByRole('row', { name: /RF-1/ })
  expect(within(row).getByText('Refund')).toBeInTheDocument()
})
