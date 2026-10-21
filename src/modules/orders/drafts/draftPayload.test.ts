import type { DraftPayload, SiteDto } from '@/api/types'
import { mocks } from '@/mocks'
import { ORDER_OPTIONS_SAMPLE as options } from '@/mocks/orderOptions'
import { newOrderDefaults, type NewOrderForm } from '../new/form'
import { estTotal, fromDraft, toPayload } from './draftPayload'

const sites = mocks.sites!({ method: 'GET' }) as SiteDto[]

const saved: NewOrderForm = {
  orderType: 'single',
  lines: [
    { code: 'CEM-T1-40KG', qty: 10 },
    { code: 'CEM-T2-BULK', qty: 2 },
  ],
  shipmentMethod: 'delivery',
  source: 'PLANT3',
  pickupDate: '',
  receivingPerson: 'Ramon Cruz',
  receivingContact: '0917 123 4567',
  receivingEmail: 'logistics@customer.com',
  requestedDate: '2026-10-28',
  timeWindow: '1:00 – 3:00 PM',
  loadingType: 'Palletized',
  callBefore: true,
  paymentMethod: 'terms',
  instructions: 'Loading type: Palletized · Call before delivery\nUse side gate',
  site: 'PLANT2',
  poRef: 'PO-8915',
}
const payload = (form: Partial<NewOrderForm> & Record<string, unknown>): DraftPayload => ({ version: 1, orderType: 'single', form: { ...saved, ...form } as NewOrderForm })

test('fromDraft restores every saved choice', () => {
  expect(fromDraft(payload({}), options, sites)).toEqual(saved)
})

test('items, site and plant that no longer exist come back empty', () => {
  const form = fromDraft(payload({ lines: [{ code: 'GONE', qty: 4 }], site: 'OLD', source: 'PLANTX' }), options, sites)
  expect(form.lines).toEqual([{ code: '', qty: 4 }])
  expect(form.site).toBe('')
  expect(form.source).toBe('')
})

test('keeps the saved site when sites are unavailable', () => {
  expect(fromDraft(payload({ site: 'PLANT2' }), options, undefined).site).toBe('PLANT2')
})

test('a draft without a site stays without one', () => {
  expect(fromDraft(payload({ site: '' }), options, sites).site).toBe('')
})

test('ignores unknown and wrongly typed keys', () => {
  const form = fromDraft(payload({ qtyX: 5, callBefore: 'yes' as unknown as boolean, paymentMethod: 'cheque' as 'cash' }), options, sites)
  expect(form).not.toHaveProperty('qtyX')
  expect(form.callBefore).toBe(false)
  expect(form.paymentMethod).toBe(newOrderDefaults(options, sites).paymentMethod)
})

test('no saved lines gives one empty line', () => {
  expect(fromDraft(payload({ lines: [] }), options, sites).lines).toEqual([{ code: '', qty: 1 }])
})

test('estTotal = current prices × qty + freight for the shipment method + other charges', () => {
  const lines = [{ code: 'CEM-T1-40KG', qty: 10 }]
  expect(estTotal(payload({ lines, shipmentMethod: 'pickup' }), options)).toBe(2450)
  expect(estTotal(payload({ lines, shipmentMethod: 'delivery' }), options)).toBe(2450 + 3500)
  expect(estTotal(payload({ lines, shipmentMethod: 'pickup' }), { ...options, otherCharges: 100 })).toBe(2550)
})

test('estTotal skips lines whose item no longer exists', () => {
  expect(estTotal(payload({ lines: [{ code: 'CEM-T1-40KG', qty: 10 }, { code: 'GONE', qty: 3 }], shipmentMethod: 'pickup' }), options)).toBe(2450)
})

test('toPayload wraps the form with version 1 and its orderType', () => {
  expect(toPayload(saved)).toEqual({ version: 1, orderType: 'single', form: saved })
})
