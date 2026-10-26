import { withAutoLine } from './instructions'

test('adds the auto line to empty text', () => {
  expect(withAutoLine('', 'Loose pile', false)).toBe('Loading type: Loose pile. Call before delivery: No.')
})

test('replaces an old auto line and keeps the customer text', () => {
  expect(withAutoLine('Loading type: Loose pile. Call before delivery: No.\nUse side gate', 'Palletized', true)).toBe(
    'Loading type: Palletized. Call before delivery: Yes.\nUse side gate',
  )
})

test('puts the auto line above text that has none', () => {
  expect(withAutoLine('Narrow road', 'Jumbo Bag', false)).toBe('Loading type: Jumbo Bag. Call before delivery: No.\nNarrow road')
})

test('text typed on the auto line itself moves below it, never duplicating the auto line', () => {
  expect(withAutoLine('Loading type: Palletized. Call before delivery: No. Test Test', 'Palletized', false)).toBe(
    'Loading type: Palletized. Call before delivery: No.\nTest Test',
  )
})

test('a hand-edited auto line is replaced, the rest kept', () => {
  expect(withAutoLine('Loading type: Anything. Call before delivery: Yes.\nGate 2', 'Loose pile', false)).toBe(
    'Loading type: Loose pile. Call before delivery: No.\nGate 2',
  )
})
