import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'

test('renders its text with the given tone, neutral by default', () => {
  render(
    <>
      <StatusPill tone="good">Default</StatusPill>
      <StatusPill>No</StatusPill>
    </>,
  )
  expect(screen.getByText('Default')).toHaveAttribute('data-tone', 'good')
  expect(screen.getByText('No')).toHaveAttribute('data-tone', 'neutral')
})
