import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'
import { ApiError, serverLogic } from '@/api/serverLogic'
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
  expect(await screen.findByText('Solid Cement')).toBeInTheDocument()
  expect(screen.getByText(/J\.D\. Santos Hardware & Construction Supply/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /J\.D\. Santos/ })).toHaveTextContent('JS')
})

test('a deep link inside the role lands on that section and marks it current', async () => {
  signInAs('full@test.ph', '/ledger')
  expect(await screen.findByRole('heading', { level: 1, name: 'Customer Ledger' })).toBeInTheDocument()
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
