import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, serverLogic } from '@/api/serverLogic'
import { draftsMock, resetDraftsMock } from '@/mocks/drafts'
import { renderApp } from '@/test/render'
import { OrdersSection } from '../OrdersSection'

vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<typeof import('sonner')>()), toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
/** Answer one Server Logic call (by name and method); every other call keeps its dev-server mock. */
function answer(name: string, method: string, value: unknown) {
  vi.mocked(serverLogic).mockImplementation(async (n, options) => {
    if (n !== name || (options?.method ?? 'GET') !== method) return actualServerLogic(n, options)
    if (value instanceof Error) throw value
    return value as never
  })
}

const SEED_ID = '6f1c2a3e-5b7d-4e8f-9a0b-1c2d3e4f5a01'

beforeEach(() => {
  resetDraftsMock()
  vi.mocked(serverLogic).mockImplementation(actualServerLogic)
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})

function openDrafts() {
  return renderApp(
    <Routes>
      <Route path="/orders/*" element={<OrdersSection />} />
    </Routes>,
    { route: '/orders/drafts' },
  )
}
const table = () => screen.findByRole('table', { name: 'Drafts' })
const tabs = () => screen.getByRole('navigation', { name: 'Orders sections' })

test('lists drafts newest first with label, Single tag, last saved, site and Est. total', async () => {
  draftsMock({ method: 'POST', body: { payload: { version: 1, orderType: 'single', form: { lines: [], shipmentMethod: 'pickup', site: '' } } } })
  openDrafts()
  const rows = within(await table()).getAllByRole('row').slice(1)
  expect(rows[0]).toHaveTextContent('Draft #2')
  expect(rows[1]).toHaveTextContent('Draft #1')
  expect(within(rows[1]).getByText('Single')).toBeInTheDocument()
  expect(rows[1]).toHaveTextContent('Oct 20, 2026')
  expect(await within(rows[1]).findByText('PLANT2 — Plant 2 — North Depot')).toBeInTheDocument()
  expect(await within(rows[1]).findByText('₱5,950.00')).toBeInTheDocument()
})

test('a site that no longer exists shows —', async () => {
  draftsMock({ method: 'PUT', query: { id: SEED_ID }, body: { payload: { version: 1, orderType: 'single', form: { lines: [], shipmentMethod: 'pickup', site: 'OLD' } } } })
  openDrafts()
  const row = within(await table()).getAllByRole('row')[1]
  await waitFor(() => expect(row.querySelectorAll('td')[2]).toHaveTextContent('—'))
})

test('shows the empty message when there are no drafts', async () => {
  draftsMock({ method: 'DELETE', query: { id: SEED_ID } })
  openDrafts()
  expect(await screen.findByText('No saved drafts. Start a new order and choose "Save as draft" to come back to it later.')).toBeInTheDocument()
})

test('a failed list shows the error with Try again', async () => {
  answer('drafts', 'GET', new ApiError(500, 'x'))
  openDrafts()
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
})

test('Continue opens New Order with the draft; + New Order opens a new one', async () => {
  openDrafts()
  await table()
  expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', `/orders/new?draft=${SEED_ID}`)
  expect(screen.getByRole('link', { name: '+ New Order' })).toHaveAttribute('href', '/orders/new')
})

test('Delete asks first; Cancel keeps the draft', async () => {
  const user = userEvent.setup()
  openDrafts()
  await table()
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete this draft?' })
  expect(dialog).toHaveTextContent('This cannot be undone, are you sure you want to proceed?')
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByText('Draft #1')).toBeInTheDocument()
})

test('Delete draft removes it and updates the badge', async () => {
  const user = userEvent.setup()
  openDrafts()
  await table()
  expect(await within(tabs()).findByRole('link', { name: 'Drafts 1' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete draft' }))
  expect(await screen.findByText(/No saved drafts/)).toBeInTheDocument()
  expect(within(tabs()).getByRole('link', { name: 'Drafts' })).toBeInTheDocument()
  expect(toast.success).toHaveBeenCalledWith('Draft #1 deleted')
})

test('a failed delete keeps the row and shows the toast', async () => {
  const user = userEvent.setup()
  answer('drafts', 'DELETE', new ApiError(500, 'x'))
  openDrafts()
  await table()
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete draft' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't delete this draft. Please try again."))
  expect(toast.success).not.toHaveBeenCalled()
  expect(screen.getByText('Draft #1')).toBeInTheDocument()
})

test('the tabs read Orders, New Order, Drafts and mark Drafts current; the page sets its title', async () => {
  openDrafts()
  await table()
  const links = within(tabs()).getAllByRole('link')
  expect(links.map((link) => link.textContent)).toEqual(['Orders', 'New Order', 'Drafts 1'])
  expect(links[2]).toHaveAttribute('aria-current', 'page')
  expect(document.title).toBe('Drafts — Concreat Connect')
})
