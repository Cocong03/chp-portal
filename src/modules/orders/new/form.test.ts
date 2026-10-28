import { ORDER_OPTIONS_SAMPLE } from '@/mocks/orderOptions'
import { newOrderDefaults, submitProblem, submitRequest, typedSubtotal, type NewOrderForm } from './form'

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

const items = ORDER_OPTIONS_SAMPLE.items

test('typedSubtotal sums qty × typed price over the chosen lines', () => {
  expect(typedSubtotal([{ code: 'CEM-T1-40KG', qty: 10, price: 2.5 }, { code: 'CEM-T2-BULK', qty: 4, price: 100 }], items)).toBe(425)
  expect(typedSubtotal([{ code: 'CEM-T1-40KG', qty: 3, price: 0.1 }], items)).toBe(0.3)
})

test('typedSubtotal ignores lines with no item or no quantity', () => {
  expect(typedSubtotal([{ code: 'CEM-T1-40KG', qty: 2, price: 5 }, { code: '', qty: 3 }, { code: 'CEM-T2-BULK', qty: 0 }], items)).toBe(10)
})

test.each([undefined, 0, -1, NaN])('typedSubtotal is null while a chosen line has price %s', (price) => {
  expect(typedSubtotal([{ code: 'CEM-T1-40KG', qty: 2, price: 5 }, { code: 'CEM-T2-BULK', qty: 1, price }], items)).toBeNull()
})

test('typedSubtotal is null with no chosen line', () => {
  expect(typedSubtotal([{ code: '', qty: 1, price: 5 }], items)).toBeNull()
})

test('submitRequest never sends a typed price', () => {
  const body = submitRequest(form({ lines: [{ code: 'CEM-T1-40KG', qty: 10, price: 200 }] }), items)
  expect(body?.lines).toEqual([{ code: 'CEM-T1-40KG', uom: 'BAG', qty: 10 }])
})

test('submitRequest sends the chosen payment method', () => {
  expect(submitRequest(form({ lines: [{ code: 'CEM-T1-40KG', qty: 1 }] }), items)?.paymentMethod).toBe('cash')
  expect(submitRequest(form({ lines: [{ code: 'CEM-T1-40KG', qty: 1 }], paymentMethod: 'credit' }), items)?.paymentMethod).toBe('credit')
})
