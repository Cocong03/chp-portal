import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ApiError, serverLogic } from '@/api/serverLogic'
import { renderApp } from '@/test/render'
import { DashboardPage } from './DashboardPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

test('shows the active announcement above the Dashboard', async () => {
  renderApp(<DashboardPage />)
  const banner = await screen.findByRole('alert')
  expect(banner).toHaveTextContent('Announcement')
  expect(banner).toHaveTextContent('Holiday order cutoff schedule')
  expect(banner).toHaveTextContent('Submit orders before 3:00 PM')
  expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  expect(document.title).toBe('Dashboard — Concreat Connect')
})

test('reads the announcement from the announcement Server Logic', async () => {
  renderApp(<DashboardPage />)
  await screen.findByRole('alert')
  expect(vi.mocked(serverLogic)).toHaveBeenCalledWith('announcement')
})

// Ops edits must show on the next visit, so the Dashboard never serves a cached banner.
test('fetches the announcement again every time the Dashboard opens', async () => {
  const first = renderApp(<DashboardPage />)
  await screen.findByRole('alert')
  first.unmount()
  vi.mocked(serverLogic).mockClear()
  render(
    <QueryClientProvider client={first.client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('alert')
  expect(vi.mocked(serverLogic)).toHaveBeenCalledWith('announcement')
})

test.each([
  ['there is no active announcement', () => vi.mocked(serverLogic).mockResolvedValueOnce(null)],
  ['the read fails', () => vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(500, 'x'))],
])('no banner when %s, and the Dashboard still loads', async (_case, arrange) => {
  arrange()
  renderApp(<DashboardPage />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(vi.mocked(serverLogic)).toHaveBeenCalledWith('announcement')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
