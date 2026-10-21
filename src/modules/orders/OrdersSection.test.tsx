import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'
import { MOCK_SESSION_KEY } from '@/auth/session'
import { renderApp } from '@/test/render'

// Load the lazy Orders chunk up front so the first test doesn't time out under a busy full-suite run.
beforeAll(() => import('./OrdersSection'), 30_000)

function signInAs(email: string, route: string) {
  sessionStorage.setItem(MOCK_SESSION_KEY, email)
  return renderApp(<App />, { route })
}

test('the Orders tabs mark the current one; + New Order opens New Order', async () => {
  const user = userEvent.setup()
  signInAs('full@test.ph', '/orders')
  const tabs = await screen.findByRole('navigation', { name: 'Orders sections' }, { timeout: 5000 })
  expect(within(tabs).getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'page')
  await user.click(await screen.findByRole('link', { name: '+ New Order' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'New Order' })).toBeInTheDocument()
  expect(within(tabs).getByRole('link', { name: 'New Order' })).toHaveAttribute('aria-current', 'page')
  expect(within(tabs).getByRole('link', { name: 'Orders' })).not.toHaveAttribute('aria-current')
  expect(within(screen.getByRole('navigation', { name: 'Portal sections' })).getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'page')
  expect(document.title).toBe('New Order — Concreat Connect')
})

test('Finance & Documents is sent from /orders/new to the Dashboard', async () => {
  signInAs('finance@test.ph', '/orders/new')
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' }, { timeout: 5000 })).toBeInTheDocument()
})

test('an unknown Orders path lands on the Orders list', async () => {
  signInAs('full@test.ph', '/orders/nope')
  expect(await screen.findByRole('table', { name: 'Orders' }, { timeout: 5000 })).toBeInTheDocument()
})
