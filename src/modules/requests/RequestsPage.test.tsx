import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import { resetServiceMocks } from '@/mocks/service'
import { renderApp } from '@/test/render'
import { LOAD_ERROR } from '@/ui/QueryError'
import { RequestsPage } from './RequestsPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

beforeEach(() => resetServiceMocks())

const table = () => screen.findByRole('table', { name: 'Requests' })
const count = () => screen.getByText((_, el) => el?.tagName === 'P' && /^Showing \d+ requests\.$/.test(el.textContent ?? ''))
const search = () => screen.getByRole('searchbox', { name: 'Search requests' })

test("shows the account's requests in the template columns, newest first, with status pills", async () => {
  renderApp(<RequestsPage />)
  const requests = await table()
  await within(requests).findByRole('row', { name: /RQ-30101/ })
  expect(within(requests).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Submitted', 'Category', 'Request Type', 'Assigned Group', 'Reference', 'Details', 'Status', '',
  ])
  expect(within(within(requests).getByRole('row', { name: /RQ-30101/ })).getByText('In Review')).toBeInTheDocument()
  const refs = within(requests).getAllByRole('row').slice(1).map((r) => /RQ-\d+/.exec(r.textContent ?? '')?.[0])
  expect(refs).toEqual(['RQ-30102', 'RQ-30101', 'RQ-30103'])
  expect(document.title).toBe('Requests — Concreat Connect')
})

test('has no page description or wireframe chrome', async () => {
  renderApp(<RequestsPage />)
  await within(await table()).findByRole('row', { name: /RQ-30101/ })
  expect(screen.queryByText(/Submit a request to your account team/)).toBeNull()
  expect(screen.queryByText(/For Client Review/)).toBeNull()
  expect(screen.queryByText(/Sample data shown/)).toBeNull()
  expect(screen.getByRole('button', { name: 'New request' })).toBeEnabled()
})

test('search matches reference, details and category field values', async () => {
  const user = userEvent.setup()
  renderApp(<RequestsPage />)
  await within(await table()).findByRole('row', { name: /RQ-30101/ })
  await user.type(search(), 'SO-100455')
  expect(count()).toHaveTextContent('Showing 1 requests.')
  expect(screen.getByRole('row', { name: /RQ-30103/ })).toBeInTheDocument()
  await user.clear(search())
  await user.type(search(), 'trp-88231')
  expect(screen.getByRole('row', { name: /RQ-30102/ })).toBeInTheDocument()
  expect(count()).toHaveTextContent('Showing 1 requests.')
})

test('category, assigned group and status filters combine; Clear filters resets them', async () => {
  const user = userEvent.setup()
  renderApp(<RequestsPage />)
  await within(await table()).findByRole('row', { name: /RQ-30101/ })
  await user.click(screen.getByRole('combobox', { name: 'Filter by category' }))
  await user.click(await screen.findByRole('option', { name: 'Delivery' }))
  expect(count()).toHaveTextContent('Showing 1 requests.')
  await user.click(screen.getByRole('combobox', { name: 'Filter by status' }))
  await user.click(await screen.findByRole('option', { name: 'Resolved' }))
  expect(count()).toHaveTextContent('Showing 0 requests.')
  expect(screen.getByRole('cell', { name: 'No requests match your filters.' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(count()).toHaveTextContent('Showing 3 requests.')
  await user.click(screen.getByRole('combobox', { name: 'Filter by assigned group' }))
  await user.click(await screen.findByRole('option', { name: 'Logistics' }))
  expect(count()).toHaveTextContent('Showing 1 requests.')
})

test('View opens the request with its category fields and additional information', async () => {
  const user = userEvent.setup()
  renderApp(<RequestsPage />)
  const row = await within(await table()).findByRole('row', { name: /RQ-30102/ })
  await user.click(within(row).getByRole('button', { name: 'View' }))
  const dialog = await screen.findByRole('dialog', { name: 'RQ-30102' })
  expect(within(dialog).getByText('Trip ID reference')).toBeInTheDocument()
  expect(within(dialog).getByText('TRP-88231')).toBeInTheDocument()
  expect(within(dialog).getByText('Site is open until 6 PM today.')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('empty account says so', async () => {
  vi.mocked(serverLogic).mockResolvedValueOnce([])
  renderApp(<RequestsPage />)
  expect(await screen.findByRole('cell', { name: "You haven't submitted any requests yet." })).toBeInTheDocument()
})

test('a failed load shows the retry message', async () => {
  vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(500, 'x'))
  renderApp(<RequestsPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_ERROR)
})
