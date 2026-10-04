import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvalidInvitationError, redeemInvitation } from '@/auth/session'
import { renderApp } from '@/test/render'
import { SetPassword } from './SetPassword'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  redeemInvitation: vi.fn(),
}))

const ROUTE = '/activate/complete?code=abc123'

async function fill(password: string, confirm = password, email = 'jd@x.ph') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email address'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.type(screen.getByLabelText('Confirm password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Activate account' }))
}

test('without a code it shows the expired-link card', () => {
  renderApp(<SetPassword />, { route: '/activate/complete' })
  expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/activate')
  expect(document.title).toBe('Set your password — Concreat Connect')
})

test.each([
  ['Ab1!', 'Use at least 8 characters.'],
  ['abcdefgh1', 'Use at least three of: uppercase letters, lowercase letters, numbers, symbols.'],
])('rejects %s with the password policy message', async (password, message) => {
  renderApp(<SetPassword />, { route: ROUTE })
  await fill(password)
  expect(await screen.findByText(message)).toBeInTheDocument()
  expect(redeemInvitation).not.toHaveBeenCalled()
})

test('rejects mismatched passwords', async () => {
  renderApp(<SetPassword />, { route: ROUTE })
  await fill('Abcdefg1', 'Abcdefg2')
  expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument()
  expect(redeemInvitation).not.toHaveBeenCalled()
})

test('activates with the code from the link', async () => {
  vi.mocked(redeemInvitation).mockResolvedValue()
  renderApp(<SetPassword />, { route: ROUTE })
  await fill('Abcdefg1')
  await waitFor(() => expect(redeemInvitation).toHaveBeenCalledWith('abc123', 'jd@x.ph', 'Abcdefg1', 'Abcdefg1'))
})

test('an invitation the server rejects shows the expired-link card', async () => {
  vi.mocked(redeemInvitation).mockRejectedValue(new InvalidInvitationError())
  renderApp(<SetPassword />, { route: ROUTE })
  await fill('Abcdefg1')
  expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
})

test('other server errors are shown above the button', async () => {
  vi.mocked(redeemInvitation).mockRejectedValue(new Error('Email already in use.'))
  renderApp(<SetPassword />, { route: ROUTE })
  await fill('Abcdefg1')
  expect(await screen.findByRole('alert')).toHaveTextContent('Email already in use.')
})
