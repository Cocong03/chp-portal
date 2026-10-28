import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { OrdersPageDto } from '@/api/types'
import { MOCK_ORDERS } from '@/mocks/orders'
import { renderApp } from '@/test/render'
import { format } from 'date-fns'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { OrdersPage } from './OrdersPage'

vi.mock('xlsx', async (importOriginal) => ({ ...(await importOriginal<typeof import('xlsx')>()), writeFile: vi.fn() }))
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<typeof import('sonner')>()), toast: { error: vi.fn() } }))

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
/** Answer `orders` with a fixed page; every other endpoint keeps its dev-server mock. */
function answerOrders(answer: OrdersPageDto | Error) {
  vi.mocked(serverLogic).mockImplementation(async (name, options) => {
    if (name !== 'orders') return actualServerLogic(name, options)
    if (answer instanceof Error) throw answer
    return answer as never
  })
}
const summary = (i: number) => {
  const { lines: _lines, ...rest } = MOCK_ORDERS[i]
  return rest
}
const lastOrdersQuery = () =>
  vi.mocked(serverLogic).mock.calls.filter(([name]) => name === 'orders').at(-1)?.[1]?.query
const table = () => screen.findByRole('table', { name: 'Orders' })

test('shows the orders in the wireframe columns with BC totals and status pills', async () => {
  renderApp(<OrdersPage />, { route: '/orders' })
  const orders = await table()
  const row = await within(orders).findByRole('row', { name: /SO-100482/ })
  expect(within(orders).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Sales Order #', 'Order date', 'PO reference', 'Delivery site', 'Ship', 'Blanket SO #', 'Trip ID', 'Expected delivery', 'Total', 'Status', '',
  ])
  expect(within(row).getByText('Sep 2, 2026')).toBeInTheDocument()
  expect(within(row).getByText('Plant 3 — Warehouse A')).toBeInTheDocument()
  expect(within(row).getByText('TRIP-40522')).toBeInTheDocument()
  expect(within(row).getByText('₱184,600.00')).toBeInTheDocument()
  expect(within(row).getByText('Invoiced')).toHaveAttribute('data-tone', 'good')
  expect(screen.getByText('Showing 1–10 of 14 orders')).toBeInTheDocument()
  expect(document.title).toBe('Orders — Concreat Connect')
})

test('BC rows without status, ship, trip or dates show dashes and no status filter', async () => {
  answerOrders({
    orders: [{ ...summary(1), status: null, ship: null, trip: null, edd: null, bso: null }],
    total: 1, page: 1, pageSize: 10,
  })
  renderApp(<OrdersPage />, { route: '/orders' })
  const row = await within(await table()).findByRole('row', { name: /SO-100467/ })
  expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(5)
  expect(screen.queryByRole('combobox', { name: 'Filter by status' })).not.toBeInTheDocument()
})

test('the status filter appears when orders have statuses and sends the chosen status', async () => {
  const user = userEvent.setup()
  renderApp(<OrdersPage />, { route: '/orders' })
  await within(await table()).findByRole('row', { name: /SO-100482/ })
  await user.click(screen.getByRole('combobox', { name: 'Filter by status' }))
  await user.click(await screen.findByRole('option', { name: 'Open' }))
  await waitFor(() => expect(lastOrdersQuery()).toMatchObject({ status: 'Open' }))
  expect(await within(await table()).findByRole('row', { name: /SO-100467/ })).toBeInTheDocument()
})

test('site options read CODE — name and the URL pre-selects one', async () => {
  const user = userEvent.setup()
  renderApp(<OrdersPage />, { route: '/orders?site=PLANT2' })
  await table()
  await waitFor(() => expect(lastOrdersQuery()).toMatchObject({ site: 'PLANT2' }))
  const site = screen.getByRole('combobox', { name: 'Filter by delivery site' })
  // The label appears once the (async) sites list has loaded.
  await waitFor(() => expect(site).toHaveTextContent('PLANT2 — Plant 2 — North Depot'))
  await user.click(site)
  expect(await screen.findByRole('option', { name: 'PLANT1 — Plant 1 — Main Yard' })).toBeInTheDocument()
})

test('search waits for typing to stop, then queries BC from page 1', async () => {
  const user = userEvent.setup()
  renderApp(<OrdersPage />, { route: '/orders?page=2' })
  await table()
  await user.type(screen.getByRole('searchbox', { name: 'Search orders' }), 'PO-8841')
  await waitFor(() => expect(lastOrdersQuery()).toMatchObject({ q: 'PO-8841' }))
  expect(lastOrdersQuery()).not.toHaveProperty('page', '2')
  expect(vi.mocked(serverLogic).mock.calls.filter(([n, o]) => n === 'orders' && o?.query?.q === 'PO-884')).toHaveLength(0)
})

test('Next and Prev change pages; Clear filters resets everything', async () => {
  const user = userEvent.setup()
  renderApp(<OrdersPage />, { route: '/orders?site=PLANT1' })
  await table()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(lastOrdersQuery()).toEqual({}))
  await user.click(await screen.findByRole('button', { name: 'Next →' }))
  await waitFor(() => expect(lastOrdersQuery()).toEqual({ page: '2' }))
  expect(await screen.findByText('Showing 11–14 of 14 orders')).toBeInTheDocument()
})

test.each([
  ['Next', (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Next →' }))],
  ['a search', (user: ReturnType<typeof userEvent.setup>) => user.type(screen.getByRole('searchbox', { name: 'Search orders' }), 'PO-8841')],
])('after %s the table shows skeleton rows until the new page arrives', async (_case, act) => {
  const user = userEvent.setup()
  let release = () => {}
  vi.mocked(serverLogic).mockImplementation(async (name, options) => {
    // Only the first orders call answers at once; the next waits until released.
    if (name === 'orders' && vi.mocked(serverLogic).mock.calls.filter(([n]) => n === 'orders').length > 1) {
      await new Promise<void>((resolve) => (release = resolve))
    }
    return actualServerLogic(name, options)
  })
  renderApp(<OrdersPage />, { route: '/orders' })
  const orders = await table()
  await within(orders).findByRole('row', { name: /SO-100482/ })
  await act(user)
  await waitFor(() => expect(orders).toHaveAttribute('aria-busy', 'true'))
  expect(within(orders).queryByRole('row', { name: /SO-100482/ })).not.toBeInTheDocument()
  release()
  await waitFor(() => expect(orders).toHaveAttribute('aria-busy', 'false'))
})

test('a page past the end jumps back to the last page', async () => {
  renderApp(<OrdersPage />, { route: '/orders?page=9' })
  // Final review 2026-10-12: while it jumps back, the table must not claim there are no orders next to "14 orders".
  expect(await screen.findByText('Showing 11–14 of 14 orders')).toBeInTheDocument()
  expect(screen.queryByRole('cell', { name: "You don't have any orders yet." })).not.toBeInTheDocument()
  expect(await screen.findByRole('row', { name: /SO-100338/ })).toBeInTheDocument()
  expect(lastOrdersQuery()).toEqual({ page: '2' })
})

test.each([
  ['filters are set', '/orders?status=Open&site=PLANT3', 'No orders match your filters.'],
  ['nothing is filtered', '/orders', "You don't have any orders yet."],
])('empty list when %s', async (_case, route, message) => {
  answerOrders({ orders: [], total: 0, page: 1, pageSize: 10 })
  renderApp(<OrdersPage />, { route })
  expect(await screen.findByRole('cell', { name: message })).toBeInTheDocument()
})

test('a failed load shows the error and Try again reloads', async () => {
  const user = userEvent.setup()
  answerOrders(new ApiError(500, 'x'))
  renderApp(<OrdersPage />, { route: '/orders' })
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  vi.mocked(serverLogic).mockImplementation(actualServerLogic)
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await within(await table()).findByRole('row', { name: /SO-100482/ })).toBeInTheDocument()
})

// S3-14: the export reads every order matching the active filters (all=true), not just the page on screen.
test('CSV / Excel downloads every order matching the filters as an .xlsx, one row per order', async () => {
  const user = userEvent.setup()
  renderApp(<OrdersPage />, { route: '/orders?status=Invoiced&site=PLANT3&page=2' })
  await table()
  const button = screen.getByRole('button', { name: /CSV \/ Excel/ })
  await user.click(button)
  await waitFor(() => expect(XLSX.writeFile).toHaveBeenCalled())
  const exportCall = vi.mocked(serverLogic).mock.calls.find(([name, options]) => name === 'orders' && options?.query?.all)
  expect(exportCall?.[1]?.query).toEqual({ status: 'Invoiced', site: 'PLANT3', all: 'true' })
  const [book, fileName] = vi.mocked(XLSX.writeFile).mock.calls[0]
  expect(fileName).toBe(`Orders-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets.Orders)
  expect(rows.map((row) => row['Sales Order #'])).toEqual(['SO-100482', 'SO-100405', 'SO-100371', 'SO-100338'])
  expect(Object.keys(rows[0])).toEqual([
    'Sales Order #', 'Order date', 'PO reference', 'Delivery site', 'Site name', 'Ship', 'Blanket SO #', 'Trip ID', 'Expected delivery', 'Total', 'Status',
  ])
  expect(rows[0]).toMatchObject({ 'Delivery site': 'PLANT3', 'Site name': 'Plant 3 — Warehouse A', Status: 'Invoiced', Total: MOCK_ORDERS[0].total })
  await waitFor(() => expect(button).toBeEnabled())
})

test('a failed export says so and the button works again', async () => {
  const user = userEvent.setup()
  renderApp(<OrdersPage />, { route: '/orders' })
  await table()
  vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(500, 'x'))
  await user.click(screen.getByRole('button', { name: /CSV \/ Excel/ }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't download your orders. Please try again."))
  expect(XLSX.writeFile).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button', { name: /CSV \/ Excel/ })).toBeEnabled())
})

test('after Submit, the note says the order was submitted, or auto-approved for a credit order BC released', async () => {
  const { unmount } = renderApp(<OrdersPage />, { route: { pathname: '/orders', state: { submitted: 'SOR000000030' } } })
  expect(await screen.findByText('SOR000000030 was submitted.')).toBeInTheDocument()
  unmount()
  renderApp(<OrdersPage />, { route: { pathname: '/orders', state: { submitted: 'SOR000000030', autoApproved: true } } })
  expect(await screen.findByText('SOR000000030 was auto-approved — within available credit, no past due balance.')).toBeInTheDocument()
  expect(screen.queryByText('SOR000000030 was submitted.')).not.toBeInTheDocument()
})
