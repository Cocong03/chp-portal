import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ScheduleItem, ScheduleRow } from './schedule'
import { ScheduleEditor } from './ScheduleEditor'

/** The per-item summary row (last row of the table's footer). */
const summaryRow = () => screen.getByRole('table', { name: 'Delivery schedule' }).querySelector('tfoot tr')!
const ORDERED: ScheduleItem[] = [{ code: 'CEM-T1-40KG', description: 'Portland Cement Type I — 40kg Bag', qty: 10 }]

function Editor({ ordered = ORDERED, initial, overHint = 'above' }: { ordered?: ScheduleItem[]; initial: ScheduleRow[]; overHint?: 'above' | 'below' }) {
  const [rows, setRows] = useState(initial)
  return <ScheduleEditor ordered={ordered} rows={rows} onChange={setRows} overHint={overHint} emptyMessage="Nothing to schedule." />
}

test('shows remaining per item and the over message with the given hint', async () => {
  const user = userEvent.setup()
  render(<Editor initial={[{ item: 'CEM-T1-40KG', qty: 12, date: '' }]} />)
  const table = screen.getByRole('table', { name: 'Delivery schedule' })
  expect(within(table).getByText('Over by 2 — reduce a scheduled quantity above')).toBeInTheDocument()
  const qty = screen.getByRole('spinbutton', { name: 'Est. quantity, row 1' })
  await user.clear(qty)
  await user.type(qty, '4')
  expect(within(table).getByText('6 not yet scheduled')).toBeInTheDocument()
  expect(summaryRow()).toHaveTextContent('4 / 10 ordered')
})

test('uses the below hint when asked', () => {
  render(<Editor initial={[{ item: 'CEM-T1-40KG', qty: 11, date: '' }]} overHint="below" />)
  expect(screen.getByText('Over by 1 — reduce a scheduled quantity below')).toBeInTheDocument()
})

test('adds and removes deliveries', async () => {
  const user = userEvent.setup()
  render(<Editor initial={[{ item: 'CEM-T1-40KG', qty: 1, date: '' }]} />)
  await user.click(screen.getByRole('button', { name: '+ Add delivery' }))
  expect(screen.getByRole('combobox', { name: 'Delivery item, row 2' })).toHaveTextContent('CEM-T1-40KG — Portland Cement Type I — 40kg Bag')
  expect(summaryRow()).toHaveTextContent('2 / 10 ordered')
  await user.click(screen.getByRole('button', { name: 'Remove delivery 1' }))
  expect(screen.queryByRole('combobox', { name: 'Delivery item, row 2' })).not.toBeInTheDocument()
  expect(summaryRow()).toHaveTextContent('1 / 10 ordered')
})

test('keeps the delivery date the customer picks', async () => {
  const user = userEvent.setup()
  render(<Editor initial={[{ item: 'CEM-T1-40KG', qty: 1, date: '' }]} />)
  const date = screen.getByLabelText('Expected delivery date, row 1')
  await user.type(date, '2026-11-20')
  expect(date).toHaveValue('2026-11-20')
})

test('with no ordered items shows the empty message and disables Add delivery', () => {
  render(<Editor ordered={[]} initial={[]} />)
  expect(screen.getByText('Nothing to schedule.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '+ Add delivery' })).toBeDisabled()
})
