import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'
import { ApiError, BlockedError, serverLogic } from '@/api/serverLogic'
import { MOCK_SESSION_KEY } from '@/auth/session'
import { go } from '@/lib/go'
import { renderApp } from '@/test/render'

vi.mock('@/lib/go', () => ({ go: vi.fn() }))
vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const ALL_SECTIONS = [
  'Dashboard',
  'Delivery Sites',
  'Orders',
  'Customer Ledger',
  'Document Center',
  'Requests',
  'Complaints & Feedback',
  'Account and User Management',
]

// Load the lazy Ledger chunk up front: its first load under a busy full-suite run took over 5 s (2026-10-15).
beforeAll(() => import('@/modules/ledger/LedgerPage'), 30_000)

function signInAs(email: string, route = '/') {
  sessionStorage.setItem(MOCK_SESSION_KEY, email)
  return renderApp(<App />, { route })
}

async function navLabels() {
  const nav = await screen.findByRole('navigation', { name: 'Portal sections' })
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent)
}

test('Full Access sees all eight sections in wireframe order', async () => {
  signInAs('full@test.ph')
  expect(await navLabels()).toEqual(ALL_SECTIONS)
})

test('Finance & Documents sees only its sections', async () => {
  signInAs('finance@test.ph')
  expect(await navLabels()).toEqual(['Dashboard', 'Customer Ledger', 'Document Center', 'Account and User Management'])
})

test('the topbar shows the company, account and signed-in user', async () => {
  signInAs('full@test.ph')
  const topbar = await screen.findByRole('banner')
  expect(await within(topbar).findByText('Solid Cement')).toBeInTheDocument()
  expect(within(topbar).getByText(/J\.D\. Santos Hardware & Construction Supply/)).toBeInTheDocument()
  expect(within(topbar).getByRole('button', { name: /J\.D\. Santos/ })).toHaveTextContent('JS')
  expect(screen.getByRole('img', { name: 'Concreat' })).toHaveAttribute('src', '/concreat-logo.webp')
})

test('a deep link inside the role lands on that section and marks it current', async () => {
  signInAs('full@test.ph', '/ledger')
  // The Ledger page is lazy-loaded; its first load in Vitest can take over a second.
  expect(await screen.findByRole('heading', { level: 1, name: 'Customer Ledger' }, { timeout: 5000 })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Customer Ledger' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  expect(document.title).toBe('Customer Ledger — Concreat Connect')
})

test('a section outside the role redirects to the Dashboard', async () => {
  signInAs('finance@test.ph', '/orders')
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  expect(document.title).toBe('Dashboard — Concreat Connect')
})

test('a contact with no business role sees the access-pending page and no nav', async () => {
  signInAs('norole@test.ph', '/orders')
  expect(await screen.findByRole('heading', { level: 1, name: 'Your portal access is being set up' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Portal sections' })).not.toBeInTheDocument()
})

test('shows a loading state while the account loads', () => {
  signInAs('full@test.ph')
  expect(screen.getByRole('status')).toHaveTextContent('Loading your account…')
})

test('a failed account load offers Retry', async () => {
  vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(500, 'boom'))
  const user = userEvent.setup()
  signInAs('full@test.ph')
  expect(await screen.findByText("We couldn't load your account details. Please try again.")).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('navigation', { name: 'Portal sections' })).toBeInTheDocument()
})

test('a failed background refresh keeps the current page on screen', async () => {
  const { client } = signInAs('full@test.ph')
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(503, 'down'))
  await act(() => client.refetchQueries({ queryKey: ['me'] }))
  // TanStack notifies observers on a setTimeout; flush it so the failed refetch reaches the UI.
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)))
  expect(client.getQueryState(['me'])?.status).toBe('error')
  expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  expect(screen.queryByText("We couldn't load your account details. Please try again.")).not.toBeInTheDocument()
})

test('the menu button opens a drawer with the role sections; picking one navigates and closes it', async () => {
  const user = userEvent.setup()
  signInAs('finance@test.ph')
  await screen.findByRole('navigation', { name: 'Portal sections' }) // account loaded
  await user.click(screen.getByRole('button', { name: 'Open menu' }))
  const drawer = await screen.findByRole('dialog', { name: 'Concreat Connect' })
  const menu = within(drawer).getByRole('navigation', { name: 'Menu' })
  expect(within(menu).getAllByRole('link').map((link) => link.textContent)).toEqual([
    'Dashboard',
    'Customer Ledger',
    'Document Center',
    'Account and User Management',
  ])
  expect(within(menu).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')

  await user.click(within(menu).getByRole('link', { name: 'Customer Ledger' }))

  expect(await screen.findByRole('heading', { level: 1, name: 'Customer Ledger' })).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('the drawer shows the account and opens Help', async () => {
  const user = userEvent.setup()
  signInAs('full@test.ph')
  await screen.findByRole('navigation', { name: 'Portal sections' }) // account loaded
  await user.click(screen.getByRole('button', { name: 'Open menu' }))
  const drawer = await screen.findByRole('dialog', { name: 'Concreat Connect' })
  expect(within(drawer).getByRole('link', { name: /J\.D\. Santos Hardware & Construction Supply/ })).toHaveAttribute('href', '/account')

  await user.click(within(drawer).getByRole('button', { name: 'Help' }))

  expect(await screen.findByRole('dialog', { name: 'Getting around Concreat Connect' })).toBeInTheDocument()
})

test('the current section tab is scrolled into view on narrow screens', async () => {
  const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
  signInAs('full@test.ph', '/complaints')
  await screen.findByRole('heading', { level: 1, name: 'Complaints & Feedback' })
  const tab = within(screen.getByRole('navigation', { name: 'Portal sections' })).getByRole('link', { name: 'Complaints & Feedback' })
  expect(scrollIntoView.mock.contexts).toContain(tab)
})

test('a contact not linked to an account sees the access-pending page, without the Viewing line', async () => {
  signInAs('nolink@test.ph')
  expect(await screen.findByRole('heading', { level: 1, name: 'Your portal access is being set up' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Portal sections' })).not.toBeInTheDocument()
  expect(screen.queryByText(/^Viewing/)).not.toBeInTheDocument()
})

test('Help lists all eight section overviews whatever the role', async () => {
  const user = userEvent.setup()
  signInAs('viewonly@test.ph')
  await user.click(await screen.findByRole('button', { name: '? Help' }))
  const dialog = await screen.findByRole('dialog', { name: 'Getting around Concreat Connect' })
  expect(within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(ALL_SECTIONS)
})

test('Sign out ends the session', async () => {
  const user = userEvent.setup()
  signInAs('full@test.ph')
  await user.click(await screen.findByRole('button', { name: /J\.D\. Santos/ }))
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
  expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBeNull()
  expect(go).toHaveBeenCalledWith('/')
})

test('a contact BC has switched off sees only the access-turned-off card', async () => {
  signInAs('blocked@test.ph')
  expect(await screen.findByRole('heading', { name: 'Your access has been turned off' })).toBeInTheDocument()
  expect(screen.getByText(/Please contact the Concreat Customer Service Center at \(02\) 8849-3600\./)).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Portal sections' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  expect(document.title).toBe('Access turned off — Concreat Connect')
})

test('cached account data plus a blocked refetch shows the card, not the old nav', async () => {
  const { client } = signInAs('full@test.ph')
  await navLabels()
  vi.mocked(serverLogic).mockRejectedValueOnce(new BlockedError())
  await act(() => client.invalidateQueries({ queryKey: ['me'] }))
  expect(await screen.findByRole('heading', { name: 'Your access has been turned off' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Portal sections' })).not.toBeInTheDocument()
})
