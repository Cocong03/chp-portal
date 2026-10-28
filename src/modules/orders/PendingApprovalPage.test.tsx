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
  expect(within(table).queryByRole('button')).not.toBeInTheDocument()
})

test('after a held submit, says it was sent to the credit team', async () => {
  answerPending(ROWS)
  open({ sentForReview: true })
  expect(await screen.findByRole('status')).toHaveTextContent('Your order was sent to our credit team for review.')
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
  await user.click(await screen.findByRole('button', { name: 'Try again' }))
  answerPending(ROWS)
  expect(await screen.findByRole('table', { name: 'Pending Approval' })).toBeInTheDocument()
})
