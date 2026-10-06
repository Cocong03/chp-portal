import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { requestPasswordReset } from '@/auth/session'
import { renderApp } from '@/test/render'
import { ForgotPassword } from './ForgotPassword'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  requestPasswordReset: vi.fn(),
}))

test('sends the reset link and shows the neutral confirmation', async () => {
  vi.mocked(requestPasswordReset).mockResolvedValue()
  const user = userEvent.setup()
  renderApp(<ForgotPassword />, { route: '/forgot-password' })
  expect(document.title).toBe('Reset your password — Concreat Connect')
  await user.type(screen.getByLabelText('Email address'), 'jd@x.ph')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(
    screen.getByText("If this email has an active Concreat Connect account, we've sent a link to reset your password. The link expires in 1 hour."),
  ).toBeInTheDocument()
  expect(requestPasswordReset).toHaveBeenCalledWith('jd@x.ph')
})

test('validates the email first', async () => {
  const user = userEvent.setup()
  renderApp(<ForgotPassword />, { route: '/forgot-password' })
  await user.type(screen.getByLabelText('Email address'), 'nope')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  expect(requestPasswordReset).not.toHaveBeenCalled()
})

test('a send failure keeps the form and explains', async () => {
  vi.mocked(requestPasswordReset).mockRejectedValue(new Error("We couldn't reach the sign-in service. Please try again."))
  const user = userEvent.setup()
  renderApp(<ForgotPassword />, { route: '/forgot-password' })
  await user.type(screen.getByLabelText('Email address'), 'jd@x.ph')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't reach the sign-in service. Please try again.")
})
