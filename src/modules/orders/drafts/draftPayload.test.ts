import type { DraftPayload, SiteDto } from '@/api/types'
import { mocks } from '@/mocks'
import { ORDER_OPTIONS_SAMPLE as options } from '@/mocks/orderOptions'
import { newOrderDefaults, quoteRequest, type NewOrderForm } from '../new/form'
import { fromDraft, toPayload } from './draftPayload'

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
  timeWindow: 'NIGHT',
  loadingType: 'Palletized',
  callBefore: true,
  paymentMethod: 'cash',
  instructions: 'Loading type: Palletized · Call before delivery\nUse side gate',
  site: 'PLANT2',
  poRef: 'PO-8915',
  schedule: [],
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

test('quoteRequest: the chosen lines in the sales unit, with the site only for delivery', () => {
  expect(quoteRequest(saved, options.items)).toEqual({
    request: { shipmentMethod: 'delivery', source: 'PLANT3', site: 'PLANT2', lines: [{ code: 'CEM-T1-40KG', uom: 'BAG', qty: 10 }, { code: 'CEM-T2-BULK', uom: 'MT', qty: 2 }] },
    indexes: [0, 1],
  })
  expect(quoteRequest({ ...saved, shipmentMethod: 'pickup' }, options.items).request?.site).toBe('')
})

test('quoteRequest skips lines without a known item or a qty above 0, keeping the form indexes', () => {
  const lines = [{ code: 'GONE', qty: 3 }, { code: 'CEM-T1-40KG', qty: 0 }, { code: '', qty: 2 }, { code: 'CEM-T1-40KG', qty: 4 }]
  const { request, indexes } = quoteRequest({ ...saved, lines }, options.items)
  expect(indexes).toEqual([3])
  expect(request?.lines).toEqual([{ code: 'CEM-T1-40KG', uom: 'BAG', qty: 4 }])
})

test('quoteRequest has nothing to price without a chosen line, a source, or a site for delivery', () => {
  expect(quoteRequest({ ...saved, lines: [] }, options.items).request).toBeNull()
  expect(quoteRequest({ ...saved, source: '' }, options.items).request).toBeNull()
  expect(quoteRequest({ ...saved, site: '' }, options.items)).toEqual({ request: null, indexes: [0, 1] })
  expect(quoteRequest({ ...saved, site: '', shipmentMethod: 'pickup' }, options.items).request).not.toBeNull()
})

test('toPayload wraps the form with version 1 and its orderType', () => {
  expect(toPayload(saved)).toEqual({ version: 1, orderType: 'single', form: saved })
})

test('a draft saved before 2026-10-26: Credit becomes Cash and an old time window becomes 8:00 AM – 5:00 PM', () => {
  const form = fromDraft(payload({ paymentMethod: 'credit', timeWindow: '1:00 – 3:00 PM' }), options, sites)
  expect(form.paymentMethod).toBe('cash')
  expect(form.timeWindow).toBe('DAY')
})

test('restores blanket prices and schedule', () => {
  const schedule = [{ item: 'CEM-T1-40KG', qty: 4, date: '2026-11-20' }]
  const form = fromDraft(
    { version: 1, orderType: 'blanket', form: { ...saved, orderType: 'blanket', lines: [{ code: 'CEM-T1-40KG', qty: 10, price: 200 }], schedule } },
    options,
    sites,
  )
  expect(form.orderType).toBe('blanket')
  expect(form.lines).toEqual([{ code: 'CEM-T1-40KG', qty: 10, price: 200 }])
  expect(form.schedule).toEqual(schedule)
})

test('an old draft with no price or schedule opens as before, with an empty schedule', () => {
  const form = fromDraft(payload({}), options, sites)
  expect(form.lines).toEqual([{ code: 'CEM-T1-40KG', qty: 10 }, { code: 'CEM-T2-BULK', qty: 2 }])
  expect(form.schedule).toEqual([])
  expect(form.orderType).toBe('single')
})

test.each([null, {}, 'x', [{ item: 'CEM-T1-40KG' }], [{ item: 1, qty: 2, date: '' }]])('a malformed schedule %j comes back empty', (schedule) => {
  expect(fromDraft(payload({ schedule: schedule as never }), options, sites).schedule).toEqual([])
})

test('an unknown order type comes back as Single', () => {
  expect(fromDraft(payload({ orderType: 'standing' as never }), options, sites).orderType).toBe('single')
})
