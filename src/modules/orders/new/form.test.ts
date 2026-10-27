import { ORDER_OPTIONS_SAMPLE } from '@/mocks/orderOptions'
import { newOrderDefaults, submitProblem, type NewOrderForm } from './form'

const form = (change: Partial<NewOrderForm>): NewOrderForm => ({ ...newOrderDefaults(ORDER_OPTIONS_SAMPLE, []), ...change })
const TODAY = '2026-10-26'

test('a date before today is refused, for the shipment method in use only', () => {
  expect(submitProblem(form({ pickupDate: '2026-10-25' }), TODAY)).toBe('Please choose a date from today onwards.')
  expect(submitProblem(form({ pickupDate: TODAY }), TODAY)).toBeNull()
  expect(submitProblem(form({ shipmentMethod: 'delivery', requestedDate: '2026-10-01', pickupDate: '2026-10-25' }), TODAY)).toBe('Please choose a date from today onwards.')
  expect(submitProblem(form({ shipmentMethod: 'delivery', requestedDate: '', pickupDate: '2026-10-25' }), TODAY)).toBeNull()
})

test('the receiving email is checked for Delivery only', () => {
  expect(submitProblem(form({ shipmentMethod: 'delivery', receivingEmail: 'juan.test.ph' }), TODAY)).toBe('Please enter a valid receiving email.')
  expect(submitProblem(form({ shipmentMethod: 'delivery', receivingEmail: ' juan@test.ph ' }), TODAY)).toBeNull()
  expect(submitProblem(form({ receivingEmail: 'juan.test.ph' }), TODAY)).toBeNull()
})
