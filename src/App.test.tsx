import { screen } from '@testing-library/react'
import { MOCK_SESSION_KEY } from '@/auth/session'
import { renderApp } from '@/test/render'
import App from './App'

// Load the lazy Dashboard chunk up front: its first load in a test takes over the 1 s findBy wait (2026-10-15).
beforeAll(() => import('@/modules/dashboard/DashboardPage'), 30_000)

test('an anonymous visitor to any page gets the sign-in screen', () => {
  renderApp(<App />, { route: '/orders' })
  expect(screen.getByRole('heading', { name: 'Sign in to Concreat Connect' })).toBeInTheDocument()
  expect(document.title).toBe('Sign in — Concreat Connect')
})

test('activation screens are reachable while signed out', () => {
  renderApp(<App />, { route: '/activate' })
  expect(screen.getByRole('heading', { name: 'Activate your account' })).toBeInTheDocument()
})

test('a signed-in user who opens an activation link lands on the Dashboard', async () => {
  sessionStorage.setItem(MOCK_SESSION_KEY, 'full@test.ph')
  renderApp(<App />, { route: '/activate/complete?code=abc' })
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
})
