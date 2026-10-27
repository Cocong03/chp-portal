import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import { renderApp } from '@/test/render'
import { BlanketOrdersPage } from './BlanketOrdersPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})
const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
/** Answer the Blanket Orders list; detail and every other endpoint keep their dev-server mocks. */
function answerBlanketList(value: unknown) {
  vi.mocked(serverLogic).mockImplementation(async (name, options) => {
    if (name !== 'orders' || options?.query?.id) return actualServerLogic(name, options)
    if (value instanceof Error) throw value
    return value as never
  })
}
afterEach(() => vi.mocked(serverLogic).mockImplementation(actualServerLogic))

const open = () => renderApp(<BlanketOrdersPage />, { route: '/orders/blanket' })

test('lists Blanket Sales Orders with the wireframe columns', async () => {
  open()
  const table = await screen.findByRole('table', { name: 'Blanket Orders' })
  const row = await within(table).findByRole('row', { name: /BSO-20441/ })
  expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Blanket SO #', 'Date', 'PO reference', 'Delivery site', 'Total', 'Status', ''])
  expect(row).toHaveTextContent('Jul 10, 2026')
  expect(row).toHaveTextContent('PO-8500-B')
  expect(row).toHaveTextContent('PLANT1')
  expect(row).toHaveTextContent('₱490,000.00')
  expect(row).toHaveTextContent('Open')
  expect(await within(row).findByText('Plant 1 — Main Yard')).toBeInTheDocument()
})

test('sets the page title and links + New Order to New Order', async () => {
  open()
  await screen.findByRole('table', { name: 'Blanket Orders' })
  expect(document.title).toBe('Blanket Orders — Concreat Connect')
  expect(screen.getByRole('link', { name: '+ New Order' })).toHaveAttribute('href', '/orders/new')
})

test('no Blanket Sales Orders shows the empty message', async () => {
  answerBlanketList({ orders: [] })
  open()
  expect(await screen.findByText('No Blanket Sales Orders yet.')).toBeInTheDocument()
})

test('a failed load shows Try again', async () => {
  answerBlanketList(new ApiError(500, 'x'))
  open()
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
})

test('View opens the BSO without a Trip ID note; its Manage schedule opens the schedule', async () => {
  const user = userEvent.setup()
  open()
  const row = await screen.findByRole('row', { name: /BSO-20441/ })
  await user.click(within(row).getByRole('button', { name: 'View' }))
  const dialog = await screen.findByRole('dialog', { name: 'BSO-20441' })
  expect(await within(dialog).findByRole('row', { name: /CEM-T1-40KG/ })).toHaveTextContent('2,000')
  expect(within(dialog).queryByText(/No Trip ID number yet/)).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Manage schedule' }))
  expect(await screen.findByRole('dialog', { name: 'Delivery schedule — BSO-20441' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'BSO-20441' })).not.toBeInTheDocument()
})

test('saving a schedule shows the success note', async () => {
  const user = userEvent.setup()
  open()
  const row = await screen.findByRole('row', { name: /BSO-20441/ })
  await user.click(within(row).getByRole('button', { name: 'Manage schedule' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delivery schedule — BSO-20441' })
  await within(dialog).findByRole('combobox', { name: 'Delivery item, row 1' })
  await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }))
  expect(await screen.findByText('Delivery schedule for BSO-20441 has been updated.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a Blanket Sales Order BC left at ₱0 shows — as its Total', async () => {
  answerBlanketList({
    orders: [{ so: 'BSO000000012', date: '2026-10-27', po: '', site: 'PLANT1', ship: 'Pickup', bso: null, trip: null, edd: null, total: 0, status: 'Open' }],
  })
  open()
  const row = await screen.findByRole('row', { name: /BSO000000012/ })
  expect(row).not.toHaveTextContent('₱0.00')
})
