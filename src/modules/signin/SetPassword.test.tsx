import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { checkActivationLink, InvalidInvitationError, redeemInvitation } from '@/auth/session'
import { renderApp } from '@/test/render'
import { SetPassword } from './SetPassword'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  redeemInvitation: vi.fn(),
  checkActivationLink: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(checkActivationLink).mockResolvedValue('valid')
})

const ROUTE = '/activate/complete?code=abc123&email=jd%40x.ph'

// The email comes from the link (read-only); wait for the link check before typing.
async function fill(password: string, confirm = password) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Password'), password)
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

test('both password fields have their own show/hide button', async () => {
  const user = userEvent.setup()
  renderApp(<SetPassword />, { route: ROUTE })
  await screen.findByLabelText('Password')
  const [first, second] = screen.getAllByRole('button', { name: 'Show password' })
  await user.click(second)
  expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'text')
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  expect(first).toHaveAccessibleName('Show password')
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

test('a used or expired link shows only the expired card, never the form', async () => {
  vi.mocked(checkActivationLink).mockResolvedValue('invalid')
  renderApp(<SetPassword />, { route: ROUTE })
  expect(screen.getByRole('status')).toHaveTextContent('Checking your link…')
  expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
  expect(screen.getByText('This activation link is invalid, has already been used, or has expired.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  expect(checkActivationLink).toHaveBeenCalledWith('abc123')
})

test('a valid link shows the email from the link, read-only', async () => {
  renderApp(<SetPassword />, { route: ROUTE })
  const email = await screen.findByLabelText('Email address')
  expect(email).toHaveValue('jd@x.ph')
  expect(email).toHaveAttribute('readonly')
})

test('an older link without an email keeps the email field editable', async () => {
  renderApp(<SetPassword />, { route: '/activate/complete?code=abc123' })
  const email = await screen.findByLabelText('Email address')
  expect(email).toHaveValue('')
  expect(email).not.toHaveAttribute('readonly')
})

test('if the link check fails, the form still shows (Power Pages rejects a used code on submit)', async () => {
  vi.mocked(checkActivationLink).mockRejectedValue(new Error('flow down'))
  renderApp(<SetPassword />, { route: ROUTE })
  expect(await screen.findByLabelText('Password')).toBeInTheDocument()
})
