import { formatDate, peso } from './format'

test.each([
  [12500.5, '₱12,500.50'],
  [0, '₱0.00'],
  [-15000, '-₱15,000.00'],
])('peso(%s) → %s', (value, text) => {
  expect(peso(value)).toBe(text)
})

test.each([
  ['2026-10-09', 'Oct 9, 2026'],
  ['', '—'],
  [null, '—'],
  [undefined, '—'],
  ['0001-01-01', '—'],
  ['not-a-date', '—'],
])('formatDate(%s) → %s', (value, text) => {
  expect(formatDate(value)).toBe(text)
})
