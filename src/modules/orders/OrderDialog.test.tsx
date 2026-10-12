import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { OrderDto } from '@/api/types'
import { MOCK_ORDERS } from '@/mocks/orders'
import { renderApp } from '@/test/render'
import { OrderDialog } from './OrderDialog'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})
const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
function answerOrder(answer: OrderDto | { notFound: true } | Error) {
  vi.mocked(serverLogic).mockImplementation(async (name, options) => {
    if (name !== 'orders') return actualServerLogic(name, options)
    if (answer instanceof Error) throw answer
    return answer as never
  })
}

test('shows the order details, its BC lines and the Order total', async () => {
  renderApp(<OrderDialog id="SO-100482" onClose={() => {}} />)
  const dialog = await screen.findByRole('dialog', { name: 'SO-100482' })
  expect(await within(dialog).findByText('PLANT3 — Plant 3 — Warehouse A')).toBeInTheDocument()
  expect(within(dialog).getByText('Sep 2, 2026')).toBeInTheDocument()
  expect(within(dialog).getByText('Invoiced')).toBeInTheDocument()
  const lines = within(dialog).getByRole('table', { name: 'Order lines' })
  expect(within(lines).getByRole('row', { name: /CEM-T1-40KG — Portland Cement Type I — 40kg Bag/ })).toHaveTextContent('600')
  expect(within(lines).getByRole('row', { name: /Order total/ })).toHaveTextContent('₱184,600.00')
  expect(within(dialog).getByText('Trip ID TRIP-40522 assigned on Sep 1, 2026.')).toBeInTheDocument()
})

test('the Order total is BC\'s total, not a sum of the lines', async () => {
  answerOrder({ ...MOCK_ORDERS[0], total: 999 })
  renderApp(<OrderDialog id="SO-100482" onClose={() => {}} />)
  const lines = await screen.findByRole('table', { name: 'Order lines' })
  expect(within(lines).getByRole('row', { name: /Order total/ })).toHaveTextContent('₱999.00')
})

test('a pending pick-up shows the amber Trip ID note', async () => {
  renderApp(<OrderDialog id="SO-100467" onClose={() => {}} />)
  expect(
    await screen.findByText("No Trip ID number yet — this order can't be picked up at the plant until one is assigned."),
  ).toBeInTheDocument()
})

test('an order without lines says so', async () => {
  answerOrder({ ...MOCK_ORDERS[0], so: 'SOR0000000013', total: 0, lines: [], trip: null, ship: null })
  renderApp(<OrderDialog id="SOR0000000013" onClose={() => {}} />)
  const lines = await screen.findByRole('table', { name: 'Order lines' })
  expect(within(lines).getByRole('cell', { name: 'No items on this order.' })).toBeInTheDocument()
  expect(within(lines).getByRole('row', { name: /Order total/ })).toHaveTextContent('₱0.00')
  // No Trip ID note (ship unknown); the details grid's "Trip ID number" label is always there.
  expect(screen.queryByText(/No Trip ID number yet|assigned/)).not.toBeInTheDocument()
})

test("someone else's or a missing order says it can't be found", async () => {
  answerOrder({ notFound: true })
  renderApp(<OrderDialog id="SOR0000000099" onClose={() => {}} />)
  expect(await screen.findByText("We couldn't find this order.")).toBeInTheDocument()
})

test('a failed load shows the error with Try again', async () => {
  answerOrder(new ApiError(500, 'x'))
  renderApp(<OrderDialog id="SO-100482" onClose={() => {}} />)
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
})

test('Close calls onClose; nothing renders without an id', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  const first = renderApp(<OrderDialog id="SO-100482" onClose={onClose} />)
  await user.click(await screen.findByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalled()
  first.unmount()
  renderApp(<OrderDialog id={null} onClose={onClose} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
