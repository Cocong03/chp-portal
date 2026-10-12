import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { OrdersPageDto } from '@/api/types'
import { MOCK_ORDERS } from '@/mocks/orders'
import { renderApp } from '@/test/render'
import { OrdersPage } from './OrdersPage'

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
