import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/orders/orders.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1',
  'BC/EnvironmentName': 'DEV',
  'BC/ApiBasePath': '/api/pasi/mcrm/v1.0',
  'BC/ClientId': 'client-1',
  'BC/ClientSecret': 'secret-1',
}
// BC DEV field names (probed 2026-10-12; documentType and status added 2026-10-13, spaces encoded as _x0020_).
const ORDER = {
  salesOrderNo: 'SOR0000000006', sellToCustomerNo: 'C00000002', orderDate: '2026-10-09', externalDocumentNo: 'PO1',
  shiptoCode: '65072350', shipmentMethodCode: '', tripEntryNo: '', requestDeliveryDate: '0001-01-01', totalAmountInclVAT: 12500.5,
  documentType: 'Order', status: 'Open', completelyShipped: false, blanketOrderNo: '',
}
const LINE = {
  documentNo: 'SOR0000000006', itemNo: 'CEM-T1-40KG', description: 'Portland Cement Type I — 40kg Bag', quantity: 50,
  unitOfMeasureCode: 'BAG', unitPrice: 245, AmountIncludingVAT: 12250,
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })

function fakeServer({
  query = {} as Record<string, string>,
  orders = [ORDER] as unknown[],
  count = 1 as number | undefined,
  search = {} as Record<string, unknown[]>,
  lines = [LINE] as unknown[],
  bcDown = false,
} = {}) {
  const http: string[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: { ServerLogicName: 'orders', QueryParameters: query, Body: '' },
    SiteSetting: { Get: (name: string) => SETTINGS[name] },
    Logger: { Log() {}, Error() {}, Warn() {} },
    Connector: {
      Dataverse: {
        RetrieveRecord: () => ({
          contactid: 'c-1', emailaddress1: 'buyer@808.ph',
          parentcustomerid_account: { accountid: 'acc-2', name: '808 TRADING', chp_bccustomerno: 'C00000002', chp_bccompanyid: 'co-1' },
        }),
      },
      HttpClient: {
        PostAsync: async () => ok({ access_token: 'tok-1' }),
        GetAsync: async (url: string) => {
          const plain = decodeURIComponent(url)
          http.push(plain)
          if (plain.includes('/MCRMContacts')) return ok({ value: [{ companyNo: 'CT1' }] })
          if (plain.includes('/mcrmBusinessRelation')) return ok({ value: [{ vendorNo: 'C00000002' }] })
          if (bcDown) return JSON.stringify({ StatusCode: 503, IsSuccessStatusCode: false, ReasonPhrase: 'Service Unavailable', Body: '' })
          if (plain.includes('/chpSalesOrderLines')) return ok({ value: lines })
          const term = Object.keys(search).find((t) => plain.includes(t))
          if (term) return ok({ value: search[term] })
          return ok(count === undefined ? { value: orders } : { value: orders, '@odata.count': count })
        },
      },
    },
  }
  return { server, http }
}

const SAFE = "We couldn't load this information. Please try again."
const orderCalls = (http: string[]) => http.filter((u) => u.includes('/mcrmSalesOrders?'))
const BASE = "sellToCustomerNo eq 'C00000002' and documentType eq 'Order'"

test("lists the session customer's SOR orders newest first, 10 per page, with the total count", async () => {
  const { server, http } = fakeServer({ query: { page: '2' }, count: 14 })
  expect(JSON.parse(await load(server).get())).toEqual({
    orders: [
      {
        so: 'SOR0000000006', date: '2026-10-09', po: 'PO1', site: '65072350', ship: null, bso: null, trip: null,
        edd: null, total: 12500.5, status: 'Open',
      },
    ],
    total: 14,
    page: 2,
    pageSize: 10,
  })
  const [call] = orderCalls(http)
  expect(call).toContain(`$filter=${BASE}&`)
  expect(call).toContain('$orderby=orderDate desc,salesOrderNo desc')
  expect(call).toContain('$top=10')
  expect(call).toContain('$skip=10')
  expect(call).toContain('$count=true')
})

test('site and dates narrow the BC filter, quotes doubled', async () => {
  const { server, http } = fakeServer({ query: { site: "S'1", from: '2026-10-01', to: '2026-10-31' } })
  await load(server).get()
  expect(orderCalls(http)[0]).toContain(`$filter=${BASE} and shiptoCode eq 'S''1' and orderDate ge 2026-10-01 and orderDate le 2026-10-31&`)
})

test('malformed dates are dropped, never sent to BC', async () => {
  const { server, http } = fakeServer({ query: { from: "2026-10-01') or 1 eq 1", to: 'abc' } })
  await load(server).get()
  expect(orderCalls(http)[0]).toContain(`$filter=${BASE}&`)
})

test('customer or company values in the request are ignored', async () => {
  const { server, http } = fakeServer({ query: { customerNo: 'C99', companyId: 'other' } })
  await load(server).get()
  expect(http.join(' ')).not.toMatch(/C99|other/)
})

test('an invalid page number falls back to page 1', async () => {
  const { server, http } = fakeServer({ query: { page: '-3' } })
  expect(JSON.parse(await load(server).get()).page).toBe(1)
  expect(orderCalls(http)[0]).toContain('$skip=0')
})

test('drops rows BC returns for another customer or that are not sales orders', async () => {
  const { server } = fakeServer({
    orders: [ORDER, { ...ORDER, salesOrderNo: 'SOR9', sellToCustomerNo: 'C1' }, { ...ORDER, salesOrderNo: 'BSO0000000001', documentType: 'Blanket_x0020_Order' }],
    count: 3,
  })
  expect(JSON.parse(await load(server).get()).orders.map((o: { so: string }) => o.so)).toEqual(['SOR0000000006'])
})

test('maps a Trip ID and an expected delivery date when BC has them', async () => {
  const { server } = fakeServer({ orders: [{ ...ORDER, tripEntryNo: 'TRIP-1', requestDeliveryDate: '2026-10-15' }] })
  const [order] = JSON.parse(await load(server).get()).orders
  expect(order.trip).toEqual({ id: 'TRIP-1', assignedAt: null })
  expect(order.edd).toBe('2026-10-15')
})

test('search runs the SO and PO queries in parallel, merges, de-duplicates and pages them', async () => {
  const older = { ...ORDER, salesOrderNo: 'SOR0000000001', orderDate: '2026-09-01', externalDocumentNo: 'PO-AB' }
  const { server, http } = fakeServer({
    query: { q: 'ab' },
    search: {
      "contains(salesOrderNo,'AB')": [older],
      "contains(externalDocumentNo,'ab')": [],
      "contains(externalDocumentNo,'AB')": [older, ORDER],
    },
  })
  const page = JSON.parse(await load(server).get())
  expect(page.orders.map((o: { so: string }) => o.so)).toEqual(['SOR0000000006', 'SOR0000000001'])
  expect(page.total).toBe(2)
  const calls = orderCalls(http)
  expect(calls).toHaveLength(3)
  for (const c of calls) {
    expect(c).toContain(`$filter=${BASE} and contains(`)
    expect(c).toContain('$top=200')
  }
})

test('lower-case search still finds the SO number and an upper-case PO', async () => {
  const { server, http } = fakeServer({ query: { q: 'sor0006' }, search: { "contains(salesOrderNo,'SOR0006')": [ORDER] } })
  expect(JSON.parse(await load(server).get()).orders).toHaveLength(1)
  expect(orderCalls(http).some((c) => c.includes("contains(externalDocumentNo,'SOR0006')"))).toBe(true)
})

test('search terms are quote-escaped in every query', async () => {
  const { server, http } = fakeServer({ query: { q: "o'brien" } })
  await load(server).get()
  const calls = orderCalls(http)
  expect(calls.some((c) => c.includes("contains(salesOrderNo,'O''BRIEN')"))).toBe(true)
  expect(calls.some((c) => c.includes("contains(externalDocumentNo,'o''brien')"))).toBe(true)
})

test('detail returns the order with its BC lines', async () => {
  const { server, http } = fakeServer({ query: { id: 'SOR0000000006' } })
  expect(JSON.parse(await load(server).get())).toEqual({
    so: 'SOR0000000006', date: '2026-10-09', po: 'PO1', site: '65072350', ship: null, bso: null, trip: null, edd: null,
    total: 12500.5, status: 'Open',
    lines: [{ code: 'CEM-T1-40KG', description: 'Portland Cement Type I — 40kg Bag', qty: 50, uom: 'BAG', unitPrice: 245, lineTotal: 12250 }],
  })
  expect(orderCalls(http)[0]).toContain("$filter=salesOrderNo eq 'SOR0000000006' and sellToCustomerNo eq 'C00000002' and documentType eq 'Order'")
  expect(http.some((u) => u.includes("chpSalesOrderLines?$filter=documentNo eq 'SOR0000000006'"))).toBe(true)
})

test.each([
  ["another customer's order (BC returns nothing)", { query: { id: 'SOR0000000099' }, orders: [] }],
  ['a row that belongs to someone else', { query: { id: 'SOR0000000006' }, orders: [{ ...ORDER, sellToCustomerNo: 'C1' }] }],
  ['a blanket order number', { query: { id: 'BSO0000000001' } }],
  ['an invoice number', { query: { id: 'SIN0000000003' } }],
])('detail of %s → notFound, lines never read', async (_case, options) => {
  const { server, http } = fakeServer(options as Parameters<typeof fakeServer>[0])
  expect(JSON.parse(await load(server).get())).toEqual({ notFound: true })
  expect(http.some((u) => u.includes('/chpSalesOrderLines'))).toBe(false)
})

test('BC down → only the customer-safe error', async () => {
  const { server } = fakeServer({ bcDown: true })
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

// Final review 2026-10-12: a date that matches the pattern but doesn't exist made BC answer 400 and broke the list.
test('impossible calendar dates are dropped, never sent to BC', async () => {
  const { server, http } = fakeServer({ query: { from: '2026-02-30', to: '2026-13-45' } })
  await load(server).get()
  expect(orderCalls(http)[0]).toContain(`$filter=${BASE}&`)
})

// Final review 2026-10-12: the 200-row search cap must keep the newest orders, not an arbitrary 200.
test('each search query asks BC for the newest orders first', async () => {
  const { server, http } = fakeServer({ query: { q: 'sor' } })
  await load(server).get()
  for (const c of orderCalls(http)) expect(c).toContain('$orderby=orderDate desc,salesOrderNo desc')
})

// Confirmed mapping (CLAUDE.md, 2026-09-14). BC encodes spaces in enum values ("Pending_x0020_Prepayment").
test.each([
  ['Open', 'Open'],
  ['Pending_x0020_Prepayment', 'Pending Prepayment'],
  ['Released', 'Ready for Dispatch'],
  ['Pending_x0020_Approval', null],
])('BC status %s → %s', async (bc, portal) => {
  const { server } = fakeServer({ orders: [{ ...ORDER, status: bc }] })
  expect(JSON.parse(await load(server).get()).orders[0].status).toBe(portal)
})

test.each([
  ['Open', "status eq 'Open' and completelyShipped eq false"],
  ['Pending Prepayment', "status eq 'Pending Prepayment' and completelyShipped eq false"],
  ['Ready for Dispatch', "status eq 'Released' and completelyShipped eq false"],
  ['Completely Shipped', 'completelyShipped eq true'],
])('the %s filter runs in BC', async (status, clause) => {
  const { server, http } = fakeServer({ query: { status } })
  await load(server).get()
  expect(orderCalls(http)[0]).toContain(`$filter=${BASE} and ${clause}&`)
})

// Invoiced orders are gone from mcrmSalesOrders and live only in the archive, which the portal doesn't read yet (S2-03).
test.each(['Invoiced', "x' or 1 eq 1"])('the %s filter answers with no orders and never reaches BC', async (status) => {
  const { server, http } = fakeServer({ query: { status } })
  expect(JSON.parse(await load(server).get())).toEqual({ orders: [], total: 0, page: 1, pageSize: 10 })
  expect(orderCalls(http)).toEqual([])
})

// BC added these to mcrmSalesOrders on 2026-10-14: an order still in BC with everything shipped (not yet invoiced) is
// Completely Shipped whatever its Status says; a drawdown names its blanket order.
test('a completely shipped order is Completely Shipped, and a drawdown shows its Blanket SO #', async () => {
  const { server, http } = fakeServer({
    orders: [{ ...ORDER, status: 'Released', completelyShipped: true, blanketOrderNo: 'BSO0000000001' }, { ...ORDER, salesOrderNo: 'SOR0000000007' }],
    count: 2,
  })
  const [shipped, plain] = JSON.parse(await load(server).get()).orders
  expect(shipped).toMatchObject({ status: 'Completely Shipped', bso: 'BSO0000000001' })
  expect(plain).toMatchObject({ status: 'Open', bso: null })
  expect(orderCalls(http)[0]).toContain(',blanketOrderNo,completelyShipped&')
})

// BC filled shipmentMethodCode on 2026-10-15: PICKUP and DELIVERY are the only codes on DEV orders.
test.each([
  ['PICKUP', 'Pickup'],
  ['DELIVERY', 'Delivery'],
  ['delivery', 'Delivery'],
  ['', null],
  ['COURIER', null],
])('shipment method %s → ship %s', async (code, ship) => {
  const { server } = fakeServer({ orders: [{ ...ORDER, shipmentMethodCode: code }] })
  expect(JSON.parse(await load(server).get()).orders[0].ship).toBe(ship)
})
