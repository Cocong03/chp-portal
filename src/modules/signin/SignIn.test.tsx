import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { signIn } from '@/auth/session'
import { renderApp } from '@/test/render'
import { SignIn } from './SignIn'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  signIn: vi.fn(),
}))

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('User ID or email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

test('shows the wireframe copy and sets the title', () => {
  renderApp(<SignIn />)
  expect(screen.getByRole('heading', { name: 'Sign in to Concreat Connect' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Concreat Connect' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/Account/Login/ForgotPassword')
  expect(screen.getByRole('link', { name: 'Activate your account' })).toHaveAttribute('href', '/activate')
  expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '#')
  expect(screen.getByRole('link', { name: 'Data Privacy Policy' })).toHaveAttribute('href', '#')
  expect(document.title).toBe('Sign in — Concreat Connect')
})

test('asks for both fields before calling the server', async () => {
  const user = userEvent.setup()
  renderApp(<SignIn />)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Enter your user ID or email.')).toBeInTheDocument()
  expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  expect(signIn).not.toHaveBeenCalled()
})

test('signs in with the trimmed user ID and the password', async () => {
  vi.mocked(signIn).mockResolvedValue()
  renderApp(<SignIn />)
  await fillAndSubmit('  jd@x.ph ', 'S3cret!')
  // Zod validation is async, so the call lands after the click resolves.
  await waitFor(() => expect(signIn).toHaveBeenCalledWith('jd@x.ph', 'S3cret!'))
})

test('shows the Power Pages error and lets the user try again', async () => {
  vi.mocked(signIn).mockRejectedValue(new Error('Invalid sign-in attempt.'))
  renderApp(<SignIn />)
  await fillAndSubmit('jd@x.ph', 'wrong')
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid sign-in attempt.')
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
})

test('a double click sends one sign-in request', async () => {
  vi.mocked(signIn).mockReturnValue(new Promise(() => {}))
  const user = userEvent.setup()
  renderApp(<SignIn />)
  await user.type(screen.getByLabelText('User ID or email'), 'jd@x.ph')
  await user.type(screen.getByLabelText('Password'), 'S3cret!')
  await user.dblClick(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
  await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1))
})
