import { screen } from '@testing-library/react'
import { MOCK_SESSION_KEY } from '@/auth/session'
import { renderApp } from '@/test/render'
import App from './App'

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
