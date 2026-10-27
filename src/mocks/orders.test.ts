import { CATALOG, ordersMock } from './orders'

test('ordersMock answers type=blanket list and detail', () => {
  const list = ordersMock({ method: 'GET', query: { type: 'blanket' } }) as { orders: Record<string, unknown>[] }
  expect(list.orders).toEqual([expect.objectContaining({ so: 'BSO-20441', site: 'PLANT1', po: 'PO-8500-B', total: 2000 * CATALOG['CEM-T1-40KG'].price })])
  expect(list.orders[0]).not.toHaveProperty('lines')
  expect(ordersMock({ method: 'GET', query: { type: 'blanket', id: 'BSO-20441' } })).toHaveProperty('lines', [expect.objectContaining({ code: 'CEM-T1-40KG', qty: 2000 })])
  expect(ordersMock({ method: 'GET', query: { type: 'blanket', id: 'SO-100482' } })).toEqual({ notFound: true })
})
