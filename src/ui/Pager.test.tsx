import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pager } from './Pager'

test('shows the range and total, and moves between pages', async () => {
  const user = userEvent.setup()
  const onPage = vi.fn()
  render(<Pager page={2} pageSize={10} total={23} noun="order" onPage={onPage} />)
  expect(screen.getByText('Showing 11–20 of 23 orders')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '← Prev' }))
  await user.click(screen.getByRole('button', { name: 'Next →' }))
  expect(onPage.mock.calls).toEqual([[1], [3]])
})

test('disables Prev on the first page and Next on the last', () => {
  const { rerender } = render(<Pager page={1} pageSize={10} total={8} noun="order" onPage={() => {}} />)
  expect(screen.getByText('Showing 1–8 of 8 orders')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '← Prev' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Next →' })).toBeDisabled()
  rerender(<Pager page={1} pageSize={10} total={1} noun="order" onPage={() => {}} />)
  expect(screen.getByText('Showing 1–1 of 1 order')).toBeInTheDocument()
  rerender(<Pager page={1} pageSize={10} total={0} noun="order" onPage={() => {}} />)
  expect(screen.getByText('Showing 0–0 of 0 orders')).toBeInTheDocument()
})
