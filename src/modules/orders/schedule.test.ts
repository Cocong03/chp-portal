import { newScheduleRow, scheduleSummary } from './schedule'

const A = { code: 'A', description: 'Item A' }
const B = { code: 'B', description: 'Item B' }

test('sums duplicate ordered lines and scheduled rows per item, in line order', () => {
  const ordered = [{ ...A, qty: 10 }, { ...B, qty: 5 }, { ...A, qty: 5 }]
  const rows = [{ item: 'A', qty: 6, date: '' }, { item: 'B', qty: 2, date: '' }, { item: 'A', qty: 4, date: '' }]
  expect(scheduleSummary(ordered, rows)).toEqual([
    { code: 'A', description: 'Item A', ordered: 15, scheduled: 10, over: false },
    { code: 'B', description: 'Item B', ordered: 5, scheduled: 2, over: false },
  ])
})

test('flags an item scheduled past its ordered quantity', () => {
  const [a] = scheduleSummary([{ ...A, qty: 10 }], [{ item: 'A', qty: 7, date: '' }, { item: 'A', qty: 4, date: '' }])
  expect(a).toMatchObject({ scheduled: 11, over: true })
})

test('ignores rows for items not on the order and blank quantities', () => {
  const rows = [{ item: 'Z', qty: 5, date: '' }, { item: 'A', qty: NaN, date: '' }]
  expect(scheduleSummary([{ ...A, qty: 10 }], rows)).toEqual([{ code: 'A', description: 'Item A', ordered: 10, scheduled: 0, over: false }])
})

test('newScheduleRow picks the first ordered item, qty 1, no date', () => {
  expect(newScheduleRow([{ ...B, qty: 1 }, { ...A, qty: 1 }])).toEqual({ item: 'B', qty: 1, date: '' })
  expect(newScheduleRow([])).toEqual({ item: '', qty: 1, date: '' })
})
