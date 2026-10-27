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
  expect(await within(lines).findByText('₱999.00')).toBeInTheDocument()
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
  expect(await within(lines).findByRole('cell', { name: 'No items on this order.' })).toBeInTheDocument()
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

test('while loading, the dialog keeps its layout: field labels, the lines table and the Order total row', async () => {
  vi.mocked(serverLogic).mockImplementation((name, options) =>
    name === 'orders' ? new Promise(() => {}) : actualServerLogic(name, options),
  )
  renderApp(<OrderDialog id="SO-100482" onClose={() => {}} />)
  const dialog = await screen.findByRole('dialog', { name: 'SO-100482' })
  for (const label of ['Order date', 'Status', 'PO reference', 'Shipment method', 'Delivery site', 'Expected delivery date', 'Blanket SO #', 'Trip ID number']) {
    expect(within(dialog).getByText(label)).toBeInTheDocument()
  }
  const lines = within(dialog).getByRole('table', { name: 'Order lines' })
  expect(within(lines).getByRole('columnheader', { name: 'Unit price' })).toBeInTheDocument()
  expect(within(lines).getByRole('row', { name: /Order total/ })).toBeInTheDocument()
})

test('blanket View: Blanket SO # is —, no Trip ID note, and Manage schedule hands over the BSO', async () => {
  const user = userEvent.setup()
  const onManageSchedule = vi.fn()
  renderApp(<OrderDialog id="BSO-20441" kind="blanket" onClose={() => {}} onManageSchedule={onManageSchedule} />)
  const dialog = await screen.findByRole('dialog', { name: 'BSO-20441' })
  expect(await within(dialog).findByRole('row', { name: /CEM-T1-40KG/ })).toHaveTextContent('2,000')
  expect(within(dialog).getByText('Blanket SO #').nextSibling).toHaveTextContent('—')
  expect(within(dialog).queryByText(/No Trip ID number yet/)).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Manage schedule' }))
  expect(onManageSchedule).toHaveBeenCalledWith('BSO-20441')
})

test("blanket View shows — for a line BC priced at 0, and BC's order total", async () => {
  answerOrder({
    so: 'BSO000000011', date: '2026-10-27', po: '', site: 'PLANT1', ship: 'Delivery', bso: null, trip: null, edd: null, total: 150, status: 'Open',
    lines: [{ code: 'CEM-T1-40KG', description: 'Portland Cement Type I — 40kg Bag', qty: 10, uom: 'BAG', unitPrice: 0, lineTotal: 0 }],
  })
  renderApp(<OrderDialog id="BSO000000011" kind="blanket" onClose={() => {}} />)
  const lines = await screen.findByRole('table', { name: 'Order lines' })
  const row = await within(lines).findByRole('row', { name: /CEM-T1-40KG/ })
  expect(within(row).getAllByText('—')).toHaveLength(2)
  expect(row).not.toHaveTextContent('₱0.00')
  expect(within(lines).getByRole('row', { name: /Order total/ })).toHaveTextContent('₱150.00')
})

test('a sales order View has no Manage schedule button', async () => {
  renderApp(<OrderDialog id="SO-100482" onClose={() => {}} />)
  const dialog = await screen.findByRole('dialog', { name: 'SO-100482' })
  await within(dialog).findByRole('row', { name: /CEM-T1-40KG/ })
  expect(within(dialog).queryByRole('button', { name: 'Manage schedule' })).not.toBeInTheDocument()
})

test('blanket View shows — for an Order total BC left at 0', async () => {
  answerOrder({
    so: 'BSO000000012', date: '2026-10-27', po: '', site: 'PLANT1', ship: 'Pickup', bso: null, trip: null, edd: null, total: 0, status: 'Open',
    lines: [{ code: 'CEM-T1-40KG', description: 'Portland Cement Type I — 40kg Bag', qty: 10, uom: 'BAG', unitPrice: 0, lineTotal: 0 }],
  })
  renderApp(<OrderDialog id="BSO000000012" kind="blanket" onClose={() => {}} />)
  const lines = await screen.findByRole('table', { name: 'Order lines' })
  const total = await within(lines).findByRole('row', { name: /Order total/ })
  await within(lines).findByRole('row', { name: /CEM-T1-40KG/ })
  expect(total).toHaveTextContent('—')
  expect(total).not.toHaveTextContent('₱0.00')
})
