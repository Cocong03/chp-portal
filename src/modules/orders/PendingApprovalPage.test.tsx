import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { PendingOrderDto } from '@/api/types'
import { renderApp } from '@/test/render'
import { PendingApprovalPage } from './PendingApprovalPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})
const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
/** Answer the pending list; every other endpoint keeps its dev-server mock. */
function answerPending(value: PendingOrderDto[] | Error | Promise<never>) {
  vi.mocked(serverLogic).mockImplementation(async (name, options) => {
    if (name !== 'orders' || options?.query?.view !== 'pending') return actualServerLogic(name, options)
    if (value instanceof Error) throw value
    return value as never
  })
}
afterEach(() => vi.mocked(serverLogic).mockImplementation(actualServerLogic))

const ROWS: PendingOrderDto[] = [
  { id: 'a', submitted: '2026-09-13', po: 'PO-8902', site: 'PLANT3', est: 215000, status: 'Awaiting credit approval', reason: 'Account has a past due balance', comment: '' },
  { id: 'b', submitted: '2026-09-05', po: '', site: 'PLANT2', est: 140000, status: 'Declined', reason: 'Order exceeds available credit', comment: 'Please settle the past due first.' },
  { id: 'c', submitted: '2026-09-01', po: 'PO-8801', site: 'PLANT1', est: 50000, status: 'Approved — being processed', reason: 'Order exceeds available credit', comment: '' },
]
const open = (state?: unknown) => renderApp(<PendingApprovalPage />, { route: { pathname: '/orders/pending', state } })

test("lists held and declined orders with reason and the credit team's comment", async () => {
  answerPending(ROWS)
  open()
  const table = await screen.findByRole('table', { name: 'Pending Approval' })
  expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Submitted', 'PO reference', 'Delivery site', 'Estimated total', 'Status', 'Why it needs review'])
  const awaiting = await within(table).findByRole('row', { name: /PO-8902/ })
  expect(awaiting).toHaveTextContent('Awaiting credit approval')
  expect(awaiting).toHaveTextContent('₱215,000.00')
  expect(awaiting).toHaveTextContent('Account has a past due balance')
  const declined = within(table).getAllByRole('row')[2]
  expect(declined).toHaveTextContent('Declined')
  expect(declined).toHaveTextContent('Credit team: Please settle the past due first.')
  expect(within(declined).getAllByRole('cell')[1]).toHaveTextContent('—')
  expect(within(table).getByRole('row', { name: /PO-8801/ })).toHaveTextContent('Approved — being processed')
  expect(within(table).queryByRole('button')).not.toBeInTheDocument()
})

test('after a held submit, says it was sent to the credit team', async () => {
  answerPending(ROWS)
  open({ sentForReview: true })
  expect(await screen.findByRole('status')).toHaveTextContent('Your order was sent to our credit team for review.')
})

test('pages 10 orders at a time, like the Orders tab', async () => {
  const user = userEvent.setup()
  answerPending(Array.from({ length: 12 }, (_, i) => ({ ...ROWS[0], id: `p${i}`, po: `PO-${i + 1}` })))
  open()
  const table = await screen.findByRole('table', { name: 'Pending Approval' })
  expect(within(table).getAllByRole('row')).toHaveLength(11)
  expect(screen.getByText('Showing 1–10 of 12 orders')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Next →' }))
  expect(screen.getByText('Showing 11–12 of 12 orders')).toBeInTheDocument()
  expect(within(table).getByRole('row', { name: /PO-12/ })).toBeInTheDocument()
})

test('shows an empty message', async () => {
  answerPending([])
  open()
  expect(await screen.findByText('No orders are waiting for approval.')).toBeInTheDocument()
})

test('shows a loading skeleton, then sets the page title', async () => {
  answerPending(new Promise<never>(() => {}))
  open()
  expect(await screen.findByRole('status')).toHaveTextContent('Loading…')
  expect(document.title).toBe('Pending Approval — Concreat Connect')
})

test('an error offers Retry, which refetches', async () => {
  const user = userEvent.setup()
  answerPending(new ApiError(500, 'boom'))
  open()
  const retry = await screen.findByRole('button', { name: 'Try again' })
  answerPending(ROWS)
  await user.click(retry)
  expect(await screen.findByRole('table', { name: 'Pending Approval' })).toBeInTheDocument()
})
