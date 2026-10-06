import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { requestActivation } from '@/auth/session'
import { renderApp } from '@/test/render'
import { Activate } from './Activate'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  requestActivation: vi.fn(),
}))

async function submit(email: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email address'), email)
  await user.click(screen.getByRole('button', { name: 'Send activation link' }))
}

test('validates the email before sending', async () => {
  renderApp(<Activate />, { route: '/activate' })
  expect(document.title).toBe('Activate your account — Concreat Connect')
  await submit('not-an-email')
  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  expect(requestActivation).not.toHaveBeenCalled()
})

test('ok shows the neutral confirmation with the 24-hour expiry', async () => {
  vi.mocked(requestActivation).mockResolvedValue('ok')
  renderApp(<Activate />, { route: '/activate' })
  await submit('jd@x.ph')
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(screen.getByText('jd@x.ph')).toBeInTheDocument()
  expect(screen.getByText(/The link can be used once and expires in 24 hours\./)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/')
  expect(requestActivation).toHaveBeenCalledWith('jd@x.ph')
})

test('needs_help asks the customer to contact the service center', async () => {
  vi.mocked(requestActivation).mockResolvedValue('needs_help')
  renderApp(<Activate />, { route: '/activate' })
  await submit('jd@x.ph')
  expect(await screen.findByRole('heading', { name: "We couldn't activate this email automatically" })).toBeInTheDocument()
  expect(
    screen.getByText(
      'This email address is linked to more than one Concreat customer account, so it needs to be set up by our team. Please contact the Concreat Customer Service Center at (02) 8849-3600.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/')
})

test('already_active offers sign in and password reset', async () => {
  vi.mocked(requestActivation).mockResolvedValue('already_active')
  renderApp(<Activate />, { route: '/activate' })
  await submit('jd@x.ph')
  expect(await screen.findByRole('heading', { name: 'Your account is already active' })).toBeInTheDocument()
  expect(screen.getByText("Sign in with your email and password. If you've forgotten your password, you can reset it.")).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('link', { name: 'Reset password' })).toHaveAttribute('href', '/forgot-password')
})

test('a send failure keeps the form and explains', async () => {
  vi.mocked(requestActivation).mockRejectedValue(new Error('flow down'))
  renderApp(<Activate />, { route: '/activate' })
  await submit('jd@x.ph')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "We couldn't send the activation email right now. Please try again in a few minutes.",
  )
  expect(screen.getByLabelText('Email address')).toBeInTheDocument()
})
