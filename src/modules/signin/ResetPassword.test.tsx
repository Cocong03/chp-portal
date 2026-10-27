import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvalidResetLinkError, resetPassword } from '@/auth/session'
import { renderApp } from '@/test/render'
import { ResetPassword } from './ResetPassword'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  resetPassword: vi.fn(),
}))

const ROUTE = '/reset-password?UserId=u-1&Code=c%2B1&email=jd%40x.ph'

async function fill(password: string, confirm = password) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New password'), password)
  await user.type(screen.getByLabelText('Confirm password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Save password' }))
}

test('shows the email from the link read-only and saves the new password', async () => {
  vi.mocked(resetPassword).mockResolvedValue()
  renderApp(<ResetPassword />, { route: ROUTE })
  expect(document.title).toBe('Set a new password — Concreat Connect')
  expect(screen.getByLabelText('Email address')).toHaveValue('jd@x.ph')
  expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly')
  await fill('Abcdefg1')
  await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('u-1', 'c+1', 'Abcdefg1', 'Abcdefg1'))
  expect(await screen.findByRole('heading', { name: 'Your password has been reset' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/')
})

test('applies the password policy before posting', async () => {
  renderApp(<ResetPassword />, { route: ROUTE })
  await fill('Ab1!')
  expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
  expect(resetPassword).not.toHaveBeenCalled()
})

test('a used or expired reset link shows the expired card with a way to request a new one', async () => {
  vi.mocked(resetPassword).mockRejectedValue(new InvalidResetLinkError())
  renderApp(<ResetPassword />, { route: ROUTE })
  await fill('Abcdefg1')
  expect(await screen.findByText('This reset link is invalid or has expired.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
})

test('a link without UserId or Code shows the expired card straight away', () => {
  renderApp(<ResetPassword />, { route: '/reset-password' })
  expect(screen.getByText('This reset link is invalid or has expired.')).toBeInTheDocument()
})

// Seen on Dev 2026-10-06: Power Pages' reset link uses lower-case userId and code.
test('accepts the lower-case userId and code that Power Pages puts in its reset link', async () => {
  vi.mocked(resetPassword).mockResolvedValue()
  renderApp(<ResetPassword />, { route: '/reset-password?userId=u-1&code=c%2B1&email=jd%40x.ph' })
  await fill('Abcdefg1')
  await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('u-1', 'c+1', 'Abcdefg1', 'Abcdefg1'))
})
