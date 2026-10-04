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

test('shows the same neutral confirmation for any accepted email', async () => {
  vi.mocked(requestActivation).mockResolvedValue()
  renderApp(<Activate />, { route: '/activate' })
  await submit('jd@x.ph')
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(screen.getByText('jd@x.ph')).toBeInTheDocument()
  expect(screen.getByText(/The link can be used once and expires in 7 days\./)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/')
  expect(requestActivation).toHaveBeenCalledWith('jd@x.ph')
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
