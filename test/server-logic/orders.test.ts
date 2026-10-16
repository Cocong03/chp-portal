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
// mcrmSalesOrderArchives (probed 2026-10-16): one row per order, latest version; no status that says Invoiced.
const ARCHIVED = {
  salesOrderNo: 'SOR0000000003', sellToCustomerNo: 'C00000002', orderDate: '2026-09-16', externalDocumentNo: 'PO1',
  shiptoCode: '65072350', shipmentMethodCode: 'PICKUP', tripEntryNo: '', requestDeliveryDate: '2026-09-16', totalAmountInclVAT: 25000,
  documentType: 'Order', status: 'Released', completelyShipped: true, invoice: true, versionNo: 2, docNoOccurrence: 1,
}
const ARCHIVE_LINE = {
  documentNo: 'SOR0000000003', docNoOccurrence: 1, versionNo: 2, itemNo: 'CEM-T1-40KG', description: 'Portland Cement Type I — 40kg Bag',
  quantity: 100, unitOfMeasureCode: 'BAG', unitPrice: 250, amountIncludingVAT: 25000,
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })

function fakeServer({
  query = {} as Record<string, string>,
  orders = [ORDER] as unknown[],
  count = 1 as number | undefined,
  search = {} as Record<string, unknown[]>,
  lines = [LINE] as unknown[],
  archive = [] as unknown[],
  archiveSearch = {} as Record<string, unknown[]>,
  archiveLines = [ARCHIVE_LINE] as unknown[],
  liveNos = undefined as string[] | undefined,
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
          if (plain.includes('/mcrmSalesOrderArchiveLines')) return ok({ value: archiveLines })
          if (plain.includes('/mcrmSalesOrderArchives')) {
            const term = Object.keys(archiveSearch).find((t) => plain.includes(t))
            return ok({ value: term ? archiveSearch[term] : archive })
          }
          if (plain.includes('$select=salesOrderNo&')) {
            return ok({ value: (liveNos ?? (orders as { salesOrderNo: string }[]).map((o) => o.salesOrderNo)).map((salesOrderNo) => ({ salesOrderNo })) })
          }
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
// Order queries, not the live-order-number lookup that sorts out invoiced orders.
const orderCalls = (http: string[]) => http.filter((u) => u.includes('/mcrmSalesOrders?') && !u.includes('$select=salesOrderNo&'))
const archiveCalls = (http: string[]) => http.filter((u) => u.includes('/mcrmSalesOrderArchives?'))
const BASE = "sellToCustomerNo eq 'C00000002' and documentType eq 'Order'"

test("lists the session customer's SOR orders newest first, 10 per page, with the total count", async () => {
  // BC answers $top=20 with pages 1–2; the 11th row, the oldest, is page 2.
  const newer = Array.from({ length: 10 }, (_, i) => ({ ...ORDER, salesOrderNo: `SOR1${i}`, orderDate: '2026-10-10' }))
  const { server, http } = fakeServer({ query: { page: '2' }, orders: [...newer, ORDER], count: 14 })
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
  // Pages 1–2 from each source, merged with the invoiced orders, then page 2 cut out.
  expect(call).toContain('$top=20')
  expect(call).not.toContain('$skip')
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
  expect(orderCalls(http)[0]).toContain('$top=10')
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
  expect(http.some((u) => u.includes('/chpSalesOrderLines') || u.includes('ArchiveLines'))).toBe(false)
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

test('an unknown status filter answers with no orders and never reaches BC', async () => {
  const { server, http } = fakeServer({ query: { status: "x' or 1 eq 1" } })
  expect(JSON.parse(await load(server).get())).toEqual({ orders: [], total: 0, page: 1, pageSize: 10 })
  expect(http.filter((u) => u.includes('/mcrmSalesOrder'))).toEqual([])
})

// BC archives an order when it's posted and deletes it once fully invoiced (probed 2026-10-16): archived and no longer
// live = Invoiced. A partly posted order is in both and keeps its live status.
const PARTLY_POSTED = { ...ARCHIVED, salesOrderNo: 'SOR0000000006', orderDate: '2026-10-09', completelyShipped: false }

test('the Invoiced filter lists archived orders that are no longer live, with the site and dates in the archive filter', async () => {
  const { server, http } = fakeServer({ query: { status: 'Invoiced', site: 'S1', from: '2026-09-01' }, archive: [ARCHIVED, PARTLY_POSTED] })
  expect(JSON.parse(await load(server).get())).toEqual({
    orders: [
      {
        so: 'SOR0000000003', date: '2026-09-16', po: 'PO1', site: '65072350', ship: 'Pickup', bso: null, trip: null,
        edd: '2026-09-16', total: 25000, status: 'Invoiced',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
  })
  const [archive] = archiveCalls(http)
  expect(archive).toContain(`$filter=${BASE} and shiptoCode eq 'S1' and orderDate ge 2026-09-01&`)
  expect(archive).toContain('$orderby=orderDate desc,salesOrderNo desc')
  expect(orderCalls(http)).toEqual([])
  expect(http.some((u) => u.includes(`/mcrmSalesOrders?$filter=${BASE}&$select=salesOrderNo&`))).toBe(true)
})

test('drops archive rows BC returns for another customer', async () => {
  const { server } = fakeServer({ query: { status: 'Invoiced' }, archive: [{ ...ARCHIVED, sellToCustomerNo: 'C1' }] })
  expect(JSON.parse(await load(server).get()).total).toBe(0)
})

test('All statuses merges live and invoiced orders newest first; the total counts both', async () => {
  const older = { ...ARCHIVED, salesOrderNo: 'SOR0000000001', orderDate: '2026-08-01' }
  const { server } = fakeServer({ orders: [ORDER], count: 1, archive: [ARCHIVED, older, PARTLY_POSTED] })
  const page = JSON.parse(await load(server).get())
  expect(page.orders.map((o: { so: string; status: string }) => [o.so, o.status])).toEqual([
    ['SOR0000000006', 'Open'],
    ['SOR0000000003', 'Invoiced'],
    ['SOR0000000001', 'Invoiced'],
  ])
  expect(page.total).toBe(3)
})

test('page 2 of All statuses is cut from the merged list', async () => {
  const live = Array.from({ length: 6 }, (_, i) => ({ ...ORDER, salesOrderNo: `SOR10${i}`, orderDate: `2026-10-0${i + 1}` }))
  const archived = Array.from({ length: 6 }, (_, i) => ({ ...ARCHIVED, salesOrderNo: `SOR20${i}`, orderDate: `2026-09-0${i + 1}` }))
  const { server } = fakeServer({ query: { page: '2' }, orders: live, count: 6, archive: archived })
  const page = JSON.parse(await load(server).get())
  expect(page.orders.map((o: { so: string }) => o.so)).toEqual(['SOR201', 'SOR200'])
  expect(page.total).toBe(12)
})

test('a live status filter never reads the archive', async () => {
  const { server, http } = fakeServer({ query: { status: 'Open' }, archive: [ARCHIVED] })
  await load(server).get()
  expect(archiveCalls(http)).toEqual([])
})

test('search finds invoiced orders too, with the same terms in the archive', async () => {
  const { server, http } = fakeServer({
    query: { q: 'po1' },
    search: { "contains(externalDocumentNo,'PO1')": [ORDER] },
    archiveSearch: { "contains(externalDocumentNo,'PO1')": [ARCHIVED] },
  })
  const page = JSON.parse(await load(server).get())
  expect(page.orders.map((o: { so: string; status: string }) => [o.so, o.status])).toEqual([['SOR0000000006', 'Open'], ['SOR0000000003', 'Invoiced']])
  expect(archiveCalls(http)).toHaveLength(3)
  expect(archiveCalls(http).some((c) => c.includes(`$filter=${BASE} and contains(salesOrderNo,'PO1')&`))).toBe(true)
})

test('no archived match skips the live-order-number lookup', async () => {
  const { server, http } = fakeServer({ query: { status: 'Invoiced' } })
  await load(server).get()
  expect(http.some((u) => u.includes('$select=salesOrderNo&'))).toBe(false)
})

test("detail of an invoiced order comes from the archive with that version's lines", async () => {
  const { server, http } = fakeServer({ query: { id: 'SOR0000000003' }, orders: [], archive: [ARCHIVED] })
  expect(JSON.parse(await load(server).get())).toEqual({
    so: 'SOR0000000003', date: '2026-09-16', po: 'PO1', site: '65072350', ship: 'Pickup', bso: null, trip: null, edd: '2026-09-16',
    total: 25000, status: 'Invoiced',
    lines: [{ code: 'CEM-T1-40KG', description: 'Portland Cement Type I — 40kg Bag', qty: 100, uom: 'BAG', unitPrice: 250, lineTotal: 25000 }],
  })
  expect(archiveCalls(http)[0]).toContain("$filter=salesOrderNo eq 'SOR0000000003' and sellToCustomerNo eq 'C00000002' and documentType eq 'Order'")
  expect(http.some((u) => u.includes("mcrmSalesOrderArchiveLines?$filter=documentNo eq 'SOR0000000003' and versionNo eq 2 and docNoOccurrence eq 1"))).toBe(true)
})

test("detail of another customer's archived order → notFound, lines never read", async () => {
  const { server, http } = fakeServer({ query: { id: 'SOR0000000003' }, orders: [], archive: [{ ...ARCHIVED, sellToCustomerNo: 'C1' }] })
  expect(JSON.parse(await load(server).get())).toEqual({ notFound: true })
  expect(http.some((u) => u.includes('ArchiveLines'))).toBe(false)
})

// BC added these to mcrmSalesOrders on 2026-10-14: an order still in BC with everything shipped (not yet invoiced) is
// Completely Shipped whatever its Status says; a drawdown names its blanket order.
test('a completely shipped order is Completely Shipped, and a drawdown shows its Blanket SO #', async () => {
  const { server, http } = fakeServer({
    orders: [{ ...ORDER, status: 'Released', completelyShipped: true, blanketOrderNo: 'BSO0000000001' }, { ...ORDER, salesOrderNo: 'SOR0000000007', orderDate: '2026-10-01' }],
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
