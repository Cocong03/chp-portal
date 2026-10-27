import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from './DatePicker'

test('shows the picked date and reports a new one as YYYY-MM-DD', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<DatePicker label="From" value="2026-10-01" onChange={onChange} />)
  // Final review 2026-10-12: the chosen date is part of the accessible name (WCAG 2.5.3 label in name).
  const trigger = screen.getByRole('button', { name: 'From Oct 1, 2026' })
  await user.click(trigger)
  await user.click(await screen.findByRole('button', { name: /October 15th, 2026/ }))
  expect(onChange).toHaveBeenCalledWith('2026-10-15')
})

test.each(['', 'abc', '2026-13-45'])('an invalid value shows no date (%j)', (value) => {
  render(<DatePicker label="From" value={value} onChange={() => {}} />)
  expect(screen.getByRole('button', { name: 'From' })).toHaveTextContent(/^From$/)
})
