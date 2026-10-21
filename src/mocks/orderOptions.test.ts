import { serverLogic } from '@/api/serverLogic'
import { SAMPLE_ACCOUNT } from './dashboard'
import { ORDER_OPTIONS_SAMPLE } from './orderOptions'
import { CATALOG } from './orders'

test('the sample options carry the wireframe catalog and the Dashboard credit figures', () => {
  expect(ORDER_OPTIONS_SAMPLE.items).toContainEqual({ code: 'CEM-T1-40KG', description: 'Portland Cement Type I — 40kg Bag', uom: 'BAG', unitPrice: 245 })
  expect(ORDER_OPTIONS_SAMPLE.items).toHaveLength(Object.keys(CATALOG).length)
  expect(ORDER_OPTIONS_SAMPLE.credit).toEqual({ limit: SAMPLE_ACCOUNT.creditLimit, available: SAMPLE_ACCOUNT.availableCredit, exposure: 335750 })
  expect(ORDER_OPTIONS_SAMPLE.plants.map((p) => `${p.code} — ${p.label}`)).toEqual([
    'PLANT1 — Plant 1 — Main Yard',
    'PLANT2 — Plant 2 — North Depot',
    'PLANT3 — Plant 3 — Warehouse A',
  ])
  expect(ORDER_OPTIONS_SAMPLE).toMatchObject({ paymentMethod: 'cash', freight: { delivery: 3500, pickup: 0 }, otherCharges: 0 })
})

// Until S3-05, the order-options Server Logic is answered by the sample on every build (like the Ledger).
test('order-options answers with the sample', async () => {
  expect(await serverLogic('order-options')).toEqual(ORDER_OPTIONS_SAMPLE)
})
