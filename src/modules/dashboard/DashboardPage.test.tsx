import { screen } from '@testing-library/react'
import { ApiError } from '@/api/serverLogic'
import { webApiGet } from '@/api/webApi'
import { renderApp } from '@/test/render'
import { DashboardPage } from './DashboardPage'

vi.mock('@/api/webApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/webApi')>()
  return { ...actual, webApiGet: vi.fn(actual.webApiGet) }
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

test('reads only the newest active announcement', async () => {
  renderApp(<DashboardPage />)
  await screen.findByRole('alert')
  expect(vi.mocked(webApiGet)).toHaveBeenCalledWith(
    'chp_announcements',
    '$select=chp_title,chp_message&$filter=chp_active eq true&$orderby=modifiedon desc&$top=1',
  )
})

test.each([
  ['there is no active announcement', () => vi.mocked(webApiGet).mockResolvedValueOnce([])],
  ['the announcement has no title', () => vi.mocked(webApiGet).mockResolvedValueOnce([{ chp_title: null, chp_message: 'x' }])],
  ['the read fails', () => vi.mocked(webApiGet).mockRejectedValueOnce(new ApiError(403, 'x'))],
])('no banner when %s, and the Dashboard still loads', async (_case, arrange) => {
  arrange()
  renderApp(<DashboardPage />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(vi.mocked(webApiGet)).toHaveBeenCalled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
