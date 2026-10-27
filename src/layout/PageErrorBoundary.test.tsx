import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { go } from '@/lib/go'
import { PageErrorBoundary } from './PageErrorBoundary'

vi.mock('@/lib/go', () => ({ go: vi.fn() }))

// A lazy page whose chunk fails (e.g. a new build replaced the hashed file while the tab was open) throws while rendering.
function BrokenPage(): never {
  throw new TypeError('Failed to fetch dynamically imported module')
}

test('a page that fails to load shows a reload prompt instead of a blank app', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const user = userEvent.setup()
  render(
    <PageErrorBoundary>
      <BrokenPage />
    </PageErrorBoundary>,
  )
  expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load this page. Please reload.")
  await user.click(screen.getByRole('button', { name: 'Reload' }))
  expect(go).toHaveBeenCalledWith(window.location.href)
})

test('renders the page when nothing fails', () => {
  render(
    <PageErrorBoundary>
      <p>Delivery Sites</p>
    </PageErrorBoundary>,
  )
  expect(screen.getByText('Delivery Sites')).toBeInTheDocument()
})
