import { render, screen } from '@testing-library/react'
import { OrderStatusPill, ShipBadge, siteLabel, tripNote } from './orderDisplay'

test.each([
  ['Open', 'neutral'],
  ['Pending Prepayment', 'warn'],
  ['Ready for Dispatch', 'progress'],
  ['Completely Shipped', 'good'],
  ['Invoiced', 'good'],
] as const)('%s uses the %s tone', (status, tone) => {
  render(<OrderStatusPill status={status} />)
  expect(screen.getByText(status)).toHaveAttribute('data-tone', tone)
})

test('no status shows a dash', () => {
  render(<OrderStatusPill status={null} />)
  expect(screen.getByText('—')).toBeInTheDocument()
})

test('ship badge shows P/D with the full word, or a dash', () => {
  const { rerender } = render(<ShipBadge ship="Pickup" />)
  expect(screen.getByText('P')).toHaveAccessibleName('Pick up')
  rerender(<ShipBadge ship="Delivery" />)
  expect(screen.getByText('D')).toHaveAccessibleName('Delivery')
  rerender(<ShipBadge ship={null} />)
  expect(screen.getByText('—')).toBeInTheDocument()
})

test.each([
  ['assigned, pick up', { ship: 'Pickup', trip: { id: 'TRIP-1', assignedAt: '2026-09-01' } }, 'good',
    'Trip ID TRIP-1 assigned on Sep 1, 2026. This is your basis for entry at the plant gate.'],
  ['assigned, delivery, date unknown', { ship: 'Delivery', trip: { id: 'TRIP-2', assignedAt: null } }, 'good', 'Trip ID TRIP-2 assigned.'],
  ['pending pick up', { ship: 'Pickup', trip: null }, 'warn',
    "No Trip ID number yet — this order can't be picked up at the plant until one is assigned."],
  ['pending delivery', { ship: 'Delivery', trip: null }, 'warn', 'No Trip ID number yet — assigned once this delivery is scheduled.'],
] as const)('trip note: %s', (_case, order, tone, text) => {
  expect(tripNote(order)).toEqual({ tone, text })
})

test('no trip note while the shipment method is unknown', () => {
  expect(tripNote({ ship: null, trip: null })).toBeNull()
})

test('site label is CODE — name, or the code alone when the site is unknown', () => {
  const sites = [{ code: 'PLANT1', name: 'Plant 1 — Main Yard' }] as never
  expect(siteLabel('PLANT1', sites)).toBe('PLANT1 — Plant 1 — Main Yard')
  expect(siteLabel('X9', sites)).toBe('X9')
  expect(siteLabel('', sites)).toBe('—')
})
