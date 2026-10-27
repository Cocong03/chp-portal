import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import { resetServiceMocks } from '@/mocks/service'
import { renderApp } from '@/test/render'
import { LOAD_ERROR } from '@/ui/QueryError'
import { ComplaintsPage } from './ComplaintsPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

beforeEach(() => resetServiceMocks())

const table = () => screen.findByRole('table', { name: 'Complaints' })
const count = () => screen.getByText((_, el) => el?.tagName === 'P' && /^Showing \d+ complaints\.$/.test(el.textContent ?? ''))
const search = () => screen.getByRole('searchbox', { name: 'Search complaints' })

test('shows complaints in the template columns with Date Resolved, no tab bar or description', async () => {
  renderApp(<ComplaintsPage />)
  const complaints = await table()
  await within(complaints).findByRole('row', { name: /CMP-20101/ })
  expect(within(complaints).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Submitted', 'Complaint Type', 'Assigned Group', 'Reference', 'Subject', 'Related order', 'Status', 'Date Resolved', '',
  ])
  expect(screen.queryByRole('tab')).toBeNull()
  expect(screen.queryByText(/File a complaint about/)).toBeNull()
  expect(screen.getByRole('button', { name: 'New complaint' })).toBeEnabled()
  expect(document.title).toBe('Complaints & Feedback — Concreat Connect')
})

test('search matches reference, subject and related order', async () => {
  const user = userEvent.setup()
  renderApp(<ComplaintsPage />)
  await within(await table()).findByRole('row', { name: /CMP-20101/ })
  await user.type(search(), 'forklift')
  expect(count()).toHaveTextContent('Showing 1 complaints.')
  await user.clear(search())
  await user.type(search(), 'so-100482')
  expect(screen.getByRole('row', { name: /CMP-20102/ })).toBeInTheDocument()
  expect(count()).toHaveTextContent('Showing 1 complaints.')
})

test('assigned group and status filters combine; Clear filters resets them', async () => {
  const user = userEvent.setup()
  renderApp(<ComplaintsPage />)
  await within(await table()).findByRole('row', { name: /CMP-20101/ })
  await user.click(screen.getByRole('combobox', { name: 'Filter by assigned group' }))
  await user.click(await screen.findByRole('option', { name: 'Logistics' }))
  expect(count()).toHaveTextContent('Showing 1 complaints.')
  await user.click(screen.getByRole('combobox', { name: 'Filter by status' }))
  await user.click(await screen.findByRole('option', { name: 'In Review' }))
  expect(count()).toHaveTextContent('Showing 0 complaints.')
  expect(screen.getByRole('cell', { name: 'No complaints match your filters.' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(count()).toHaveTextContent('Showing 4 complaints.')
})

test('View on a resolved complaint shows the resolution; an open one does not', async () => {
  const user = userEvent.setup()
  renderApp(<ComplaintsPage />)
  const tbl = await table()
  await user.click(within(await within(tbl).findByRole('row', { name: /CMP-20101/ })).getByRole('button', { name: 'View' }))
  const dialog = await screen.findByRole('dialog', { name: 'CMP-20101' })
  expect(within(dialog).getByText('Description')).toBeInTheDocument()
  expect(within(dialog).getByText('Resolution')).toBeInTheDocument()
  expect(within(dialog).getByText(/Shortage confirmed against the delivery ticket/)).toBeInTheDocument()
  expect(within(dialog).getByText(/^Email — /)).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Close' }))
  await user.click(within(within(tbl).getByRole('row', { name: /CMP-20102/ })).getByRole('button', { name: 'View' }))
  const open = await screen.findByRole('dialog', { name: 'CMP-20102' })
  expect(within(open).getByText('Description')).toBeInTheDocument()
  expect(within(open).queryByText('Resolution')).toBeNull()
})

test('empty account says so', async () => {
  vi.mocked(serverLogic).mockResolvedValueOnce([])
  renderApp(<ComplaintsPage />)
  expect(await screen.findByRole('cell', { name: "You haven't submitted any complaints yet." })).toBeInTheDocument()
})

test('a failed load shows the retry message', async () => {
  vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(500, 'x'))
  renderApp(<ComplaintsPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_ERROR)
})
