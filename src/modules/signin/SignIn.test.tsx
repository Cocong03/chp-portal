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
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

test('shows the wireframe copy and sets the title', () => {
  renderApp(<SignIn />)
  expect(screen.getByRole('heading', { name: 'Sign in to Concreat Connect' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Concreat Connect' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
  expect(screen.getByRole('link', { name: 'Activate your account' })).toHaveAttribute('href', '/activate')
  expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '#')
  expect(screen.getByRole('link', { name: 'Data Privacy Policy' })).toHaveAttribute('href', '#')
  expect(document.title).toBe('Sign in — Concreat Connect')
})

test('shows the client-supplied Concreat logo and cement bag images', () => {
  const { container } = renderApp(<SignIn />)
  expect(screen.getByRole('img', { name: 'Concreat' })).toHaveAttribute('src', '/concreat-logo.webp')
  // Bags are decorative (the pills below name them), so they carry empty alt text.
  const bags = [...container.querySelectorAll('img[alt=""]')].map((img) => img.getAttribute('src'))
  expect(bags).toEqual(['/apo-cement-bag.webp', '/rizal-cement-bag.webp', '/island-cement-bag.webp'])
  expect(screen.getByText('APO CEMENT')).toBeInTheDocument()
})

test('on phones the form comes right after the intro, before the features and bags', () => {
  renderApp(<SignIn />)
  const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  const lede = screen.getByText(/gives you a secure view of every account/)
  const form = screen.getByRole('heading', { name: 'Sign in to Concreat Connect' })
  const features = screen.getByText('See your account at a glance')
  expect(follows(lede, form)).toBe(true)
  expect(follows(form, features)).toBe(true)
})

test('asks for both fields before calling the server', async () => {
  const user = userEvent.setup()
  renderApp(<SignIn />)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Enter your email.')).toBeInTheDocument()
  expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  expect(signIn).not.toHaveBeenCalled()
})

test('labels the field Email, with the sample placeholder', () => {
  renderApp(<SignIn />)
  expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'j.santos@sample-customer.ph')
  expect(screen.queryByText('User ID or email')).not.toBeInTheDocument()
})

test('rejects something that is not an email address', async () => {
  renderApp(<SignIn />)
  await fillAndSubmit('jdsantos', 'S3cret!')
  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  expect(signIn).not.toHaveBeenCalled()
})

test('the eye button shows and hides the password', async () => {
  const user = userEvent.setup()
  renderApp(<SignIn />)
  const password = screen.getByLabelText('Password')
  expect(password).toHaveAttribute('type', 'password')
  await user.click(screen.getByRole('button', { name: 'Show password' }))
  expect(password).toHaveAttribute('type', 'text')
  await user.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(password).toHaveAttribute('type', 'password')
})

test('signs in with the trimmed email and the password', async () => {
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
  await user.type(screen.getByLabelText('Email'), 'jd@x.ph')
  await user.type(screen.getByLabelText('Password'), 'S3cret!')
  await user.dblClick(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
  await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1))
})
