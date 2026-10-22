import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { DashboardDto, MeDto } from '@/api/types'
import { MOCK_SESSION_KEY } from '@/auth/session'
import { dashboardMock } from '@/mocks/dashboard'
import { renderApp } from '@/test/render'
import { DashboardPage } from './DashboardPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
/** Answer one Server Logic by name; every other endpoint keeps its dev-server mock. */
function answer(name: string, value: unknown) {
  vi.mocked(serverLogic).mockImplementation(async (n, options) => {
    if (n !== name) return actualServerLogic(n, options)
    if (value instanceof Error) throw value
    return value as never
  })
}
const region = (name: string) => screen.findByRole('region', { name })

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
  ['there is no active announcement', () => answer('announcement', null)],
  ['the read fails', () => answer('announcement', new ApiError(500, 'x'))],
])('no banner when %s, and the Dashboard still loads', async (_case, arrange) => {
  arrange()
  renderApp(<DashboardPage />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(vi.mocked(serverLogic)).toHaveBeenCalledWith('announcement')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('Account overview shows the BC figures in the wireframe tiles; overdue is red when something is overdue', async () => {
  renderApp(<DashboardPage />)
  const overview = await region('Account overview')
  expect(await within(overview).findByText('₱468,250.00')).toBeInTheDocument()
  for (const [label, caption] of [
    ['Outstanding Balance', 'Total outstanding on your account'],
    ['Balance Due Today', 'Due now per your payment terms'],
    ['Credit limit', 'Set on your customer record'],
    ['Available credit', 'Kept in sync with your live credit standing'],
  ]) {
    expect(within(overview).getByText(label)).toBeInTheDocument()
    expect(within(overview).getByText(caption)).toBeInTheDocument()
  }
  expect(within(overview).getByText('₱42,500.00')).toHaveClass('text-destructive')
  expect(within(overview).getByText('Past its due date — please settle to avoid delivery holds')).toBeInTheDocument()
})

test('nothing overdue is green; figures BC has not provided yet show a dash and are never green', async () => {
  const base = dashboardMock()
  answer('dashboard', { ...base, account: { ...base.account, overdue: 0 } } satisfies DashboardDto)
  const first = renderApp(<DashboardPage />)
  expect(await within(await region('Account overview')).findByText('Nothing past due — account in good standing')).toBeInTheDocument()
  first.unmount()
  answer('dashboard', { ...base, account: { balance: null, balanceDue: null, overdue: null, creditLimit: 750000, availableCredit: null } } satisfies DashboardDto)
  renderApp(<DashboardPage />)
  const overview = await region('Account overview')
  expect(await within(overview).findAllByText('—')).toHaveLength(4)
  expect(within(overview).getByText('Past its due date')).toBeInTheDocument()
  expect(within(overview).queryByText('Nothing past due — account in good standing')).not.toBeInTheDocument()
})

test('Sales Orders tiles link to the filtered Orders list for roles that can open Orders, Invoiced included', async () => {
  renderApp(<DashboardPage />)
  const orders = await region('Sales Orders')
  const open = await within(orders).findByRole('link', { name: /Open/ })
  expect(open).toHaveAttribute('href', '/orders?status=Open')
  expect(open).toHaveTextContent('View these orders →')
  expect(within(orders).getByRole('link', { name: /Pending prepayment/ })).toHaveAttribute('href', '/orders?status=Pending%20Prepayment')
  expect(within(orders).getByRole('link', { name: /Ready for dispatch/ })).toHaveAttribute('href', '/orders?status=Ready%20for%20Dispatch')
  expect(within(orders).getByRole('link', { name: /Completely shipped/ })).toHaveTextContent('4')
  const invoiced = within(orders).getByRole('link', { name: /Invoiced/ })
  expect(invoiced).toHaveAttribute('href', '/orders?status=Invoiced')
  expect(invoiced).toHaveTextContent('7')
})

test('a count BC did not send shows a dash and is not a link', async () => {
  const base = dashboardMock()
  answer('dashboard', { ...base, counts: { ...base.counts, invoiced: null } } satisfies DashboardDto)
  renderApp(<DashboardPage />)
  const orders = await region('Sales Orders')
  await within(orders).findByRole('link', { name: /Open/ })
  expect(within(orders).queryByRole('link', { name: /Invoiced/ })).not.toBeInTheDocument()
  expect(within(orders).getByText('Invoiced').parentElement).toHaveTextContent('—')
})

test('a zero count is a real figure', async () => {
  const base = dashboardMock()
  answer('dashboard', { ...base, counts: { ...base.counts, open: 0 } } satisfies DashboardDto)
  renderApp(<DashboardPage />)
  expect(await within(await region('Sales Orders')).findByRole('link', { name: /Open\s*0/ })).toBeInTheDocument()
})

test('Finance & Documents sees the counts without links', async () => {
  sessionStorage.setItem(MOCK_SESSION_KEY, 'finance@test.ph')
  renderApp(<DashboardPage />)
  await screen.findByText(/^Good (morning|afternoon|evening)/) // me has loaded
  const orders = await region('Sales Orders')
  await within(orders).findByText('Open')
  expect(within(orders).queryAllByRole('link')).toHaveLength(0)
  expect(within(orders).queryByText('View these orders →')).not.toBeInTheDocument()
})

test('a failed load shows the error with Try again; the greeting and announcement stay', async () => {
  const user = userEvent.setup()
  answer('dashboard', new ApiError(500, 'x'))
  renderApp(<DashboardPage />)
  expect(await screen.findByText("We couldn't load this information. Please try again.")).toBeInTheDocument()
  expect(await screen.findByText('Holiday order cutoff schedule')).toBeInTheDocument()
  vi.mocked(serverLogic).mockImplementation(actualServerLogic)
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await region('Sales Orders')).toBeInTheDocument()
})

// S2-09 (2026-10-22): the deployed site shows BC's credit overview, never the sample figures.
test('the deployed build shows the Account overview from BC', async () => {
  vi.stubEnv('DEV', false)
  const me: MeDto = { contact: { name: 'J.D. Santos', email: 'full@test.ph' }, account: null, roles: ['Full Access'] }
  const live: DashboardDto = { ...dashboardMock(), account: { balance: 174000, balanceDue: 24750, overdue: 24750, creditLimit: 500000, availableCredit: 296780 } }
  vi.mocked(serverLogic).mockImplementation(async (name) => (name === 'me' ? me : name === 'dashboard' ? live : null) as never)
  renderApp(<DashboardPage />)
  const overview = await region('Account overview')
  expect(await within(overview).findByText('₱174,000.00')).toBeInTheDocument()
  expect(within(overview).getByText('₱296,780.00')).toBeInTheDocument()
  expect(within(overview).queryByText('₱468,250.00')).not.toBeInTheDocument()
})
