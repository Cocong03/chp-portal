import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// orders POST: Submit (S3-10). Cash orders and credit orders (S3-04): credit is created at once when BC's credit overview
// allows it, held in chp_creditapprovals for the credit team otherwise.
const source = readFileSync(resolve('.powerpages-site/server-logic/orders/orders.js'), 'utf8')
const load = (server: unknown): { post: () => Promise<string> } => new Function('Server', `${source}\nreturn { post }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'client-1', 'BC/ClientSecret': 'secret-1',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 201, IsSuccessStatusCode: true, Body: JSON.stringify(value) })
const PRICED = { unitPrice: 210, lineAmount: 10500, freightAmount: 500, fuelSurchargeAmount: 250, portChargesAmount: 0, totalAmount: 11250, message: '' }
const BASE = 'https://api.businesscentral.dynamics.com/v2.0/tenant-1/DEV/api/pasi/mcrm/v1.0/companies(co-1)/'

function fakeServer(
  body: unknown,
  { quote = PRICED as unknown, blocked = false, orderFails = false, credit = { overdueAmount: 0, availableCredit: 50000 } as unknown, creditFails = false } = {},
) {
  const posts: { entity: string; body: Record<string, unknown> }[] = []
  const created: { set: string; row: Record<string, unknown> }[] = []
  let creditCalls = 0
  const server = {
    User: { contactid: 'c-1' },
    Context: { ServerLogicName: 'orders', QueryParameters: {}, Body: JSON.stringify(body) },
    SiteSetting: { Get: (name: string) => SETTINGS[name] },
    Logger: { Log() {}, Error() {}, Warn() {} },
    Connector: {
      Dataverse: {
        RetrieveRecord: () => ({
          contactid: 'c-1', emailaddress1: 'buyer@808.ph',
          parentcustomerid_account: { accountid: 'acc-2', name: '808 TRADING', chp_bccustomerno: 'C00000002', chp_bccompanyid: 'co-1' },
        }),
        CreateRecord: (set: string, json: string) => {
          created.push({ set, row: JSON.parse(json) })
          return '{}'
        },
      },
      HttpClient: {
        PostAsync: async (url: string, text: string) => {
          if (url.includes('login.microsoftonline.com')) return ok({ access_token: 'tok-1' })
          const entity = url.replace(BASE, '')
          posts.push({ entity, body: JSON.parse(text) })
          if (entity === 'portalPriceQuotes') return ok(quote)
          if (orderFails) return JSON.stringify({ StatusCode: 400, IsSuccessStatusCode: false, ReasonPhrase: 'Bad Request', Body: '' })
          return ok({ id: 'g-1', salesOrderNo: 'SOR000000024', sellToCustomerNo: 'C00000002', status: 'Open' })
        },
        GetAsync: async (url: string) => {
          const plain = decodeURIComponent(url)
          if (plain.includes('/MCRMContacts')) return ok({ value: blocked ? [] : [{ companyNo: 'CT1', name: 'ERLINDA' }] })
          if (plain.includes('/mcrmBusinessRelation')) return ok({ value: [{ vendorNo: 'C00000002' }] })
          if (plain.includes('/mcrmCustCreditOverviews')) {
            creditCalls++
            if (creditFails) return JSON.stringify({ StatusCode: 500, IsSuccessStatusCode: false, ReasonPhrase: 'Server Error', Body: '' })
            return ok({ value: credit ? [{ customerNo: 'C00000002', ...(credit as object) }] : [] })
          }
          return ok({ value: [] })
        },
      },
    },
  }
  return { server, posts, created, creditReads: () => creditCalls, orders: () => posts.filter((post) => post.entity === 'mcrmSalesOrders') }
}

const LINE = { code: '100016', uom: 'BAG/40', qty: 50 }
const PICKUP = {
  shipmentMethod: 'pickup', source: 'SOLID', site: 'PLANT2', lines: [LINE], paymentMethod: 'cash', poRef: 'PO-8915',
  pickupDate: '2026-10-27', requestedDate: '2026-10-28', receivingPerson: 'Juan', receivingContact: '0917', receivingEmail: 'juan@test.ph',
  timeWindow: 'DAY', instructions: 'Loading type: Loose pile. Call before delivery: No.',
}
const DELIVERY = { ...PICKUP, shipmentMethod: 'delivery', site: '65072350' }
const CREDIT = { ...PICKUP, paymentMethod: 'credit' }
const ORDER_LINE = { type: 'Item', itemNo: '100016', quantity: 50, unitOfMeasureCode: 'BAG/40', sourcePlant: 'SOLID' }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-26T02:00:00Z')) // 10:00 on Oct 26 in Manila
})
afterEach(() => vi.useRealTimers())

test("pick up: re-quotes, then creates the session customer's order with the pick up date and the plant on every line", async () => {
  const { server, posts, orders } = fakeServer({ ...PICKUP, customerNo: 'C99999999' })
  expect(JSON.parse(await load(server).post())).toEqual({ so: 'SOR000000024' })
  expect(posts.map((post) => post.entity)).toEqual(['portalPriceQuotes', 'mcrmSalesOrders'])
  expect(posts[0].body).toMatchObject({ customerNo: 'C00000002', itemNo: '100016', shipmentMethodCode: 'PICKUP', orderDate: '2026-10-26' })
  expect(orders()[0].body).toEqual({
    sellToCustomerNo: 'C00000002',
    externalDocumentNo: 'PO-8915',
    shipmentMethodCode: 'PICKUP',
    locationCode: 'SOLID',
    paymentMethodCode: 'CASH',
    specialInstruction: 'Loading type: Loose pile. Call before delivery: No.',
    shipmentDate: '2026-10-27',
    mcrmSalesOrderLines: [ORDER_LINE],
  })
})

test('delivery: the delivery site and the receiving details, no pick up date', async () => {
  const { server, orders } = fakeServer({ ...DELIVERY, lines: [LINE, { code: '100014', uom: 'BAG/40', qty: 5 }] })
  await load(server).post()
  expect(orders()[0].body).toEqual({
    sellToCustomerNo: 'C00000002',
    externalDocumentNo: 'PO-8915',
    shipmentMethodCode: 'DELIVERY',
    locationCode: 'SOLID',
    paymentMethodCode: 'CASH',
    specialInstruction: 'Loading type: Loose pile. Call before delivery: No.',
    shiptoCode: '65072350',
    contactPerson: 'Juan',
    selltoPhoneNo: '0917',
    additionalEMail: 'juan@test.ph',
    requestDeliveryDate: '2026-10-28',
    receivingTime: 'DAY',
    mcrmSalesOrderLines: [ORDER_LINE, { ...ORDER_LINE, itemNo: '100014', quantity: 5 }],
  })
})

test('empty optional fields are left for BC to default', async () => {
  const blank = { ...DELIVERY, poRef: '', requestedDate: '', receivingPerson: '', receivingContact: '', receivingEmail: '', instructions: '' }
  const { server, orders } = fakeServer(blank)
  await load(server).post()
  expect(orders()[0].body).toEqual({
    sellToCustomerNo: 'C00000002', shipmentMethodCode: 'DELIVERY', locationCode: 'SOLID', paymentMethodCode: 'CASH',
    shiptoCode: '65072350', receivingTime: 'DAY', mcrmSalesOrderLines: [ORDER_LINE],
  })
})

test("a line BC can't price stops the order", async () => {
  const { server, orders } = fakeServer(PICKUP, { quote: { ...PRICED, unitPrice: 0, lineAmount: 0, totalAmount: 0, message: 'No price for this area.' } })
  expect(JSON.parse(await load(server).post())).toEqual({ notPriced: true })
  expect(orders()).toEqual([])
})

test.each([
  ['an unknown payment method', { paymentMethod: 'cheque' }],
  ['no payment method', { paymentMethod: undefined }],
  ['a time window BC has no code for', { ...DELIVERY, timeWindow: '9:00 AM – 12:00 NN' }],
  ['a pick up date before today', { pickupDate: '2026-10-25' }],
  ['a delivery date that is no date', { ...DELIVERY, requestedDate: '2026-02-30' }],
  ['a receiving email over 30 characters', { ...DELIVERY, receivingEmail: 'receiving.department@sample.ph' + 'x' }],
  ['a receiving email without @', { ...DELIVERY, receivingEmail: 'juan.test.ph' }],
  ['a PO reference over 35 characters', { poRef: 'P'.repeat(36) }],
  ['instructions over 2048 characters', { instructions: 'x'.repeat(2049) }],
  ['no lines', { lines: [] }],
  ['delivery without a site', { ...DELIVERY, site: '' }],
])('refused without calling BC: %s', async (_name, change) => {
  const { server, posts } = fakeServer({ ...PICKUP, ...change })
  await expect(load(server).post()).rejects.toThrow("We couldn't load this information. Please try again.")
  expect(posts).toEqual([])
})

test('a contact BC has blocked gets {blocked} and no order', async () => {
  const { server, posts } = fakeServer(PICKUP, { blocked: true })
  expect(JSON.parse(await load(server).post())).toEqual({ blocked: true })
  expect(posts).toEqual([])
})

test('a BC failure creating the order is a safe error', async () => {
  const { server } = fakeServer(PICKUP, { orderFails: true })
  await expect(load(server).post()).rejects.toThrow("We couldn't load this information. Please try again.")
})

test('credit within available and no past due: created at once with CREDIT, nothing held', async () => {
  const { server, orders, created } = fakeServer(CREDIT, { credit: { overdueAmount: 0, availableCredit: 50000 } })
  expect(JSON.parse(await load(server).post())).toEqual({ so: 'SOR000000024', autoApproved: true })
  expect(orders()[0].body.paymentMethodCode).toBe('CREDIT')
  expect(created).toEqual([])
})

test('credit equal to available: released (≤)', async () => {
  const { server, orders, created } = fakeServer(CREDIT, { credit: { overdueAmount: 0, availableCredit: 11250 } })
  expect(JSON.parse(await load(server).post())).toEqual({ so: 'SOR000000024', autoApproved: true })
  expect(orders()).toHaveLength(1)
  expect(created).toEqual([])
})

test.each([
  ['over credit', { overdueAmount: 0, availableCredit: 11249.99 }, 'Order exceeds available credit'],
  ['negative available', { overdueAmount: 0, availableCredit: -500 }, 'Order exceeds available credit'],
  ['past due', { overdueAmount: 1, availableCredit: 50000 }, 'Account has a past due balance'],
  ['both', { overdueAmount: 24750, availableCredit: 2000 }, 'Account has a past due balance · Order exceeds available credit'],
])('credit %s: held for the credit team, nothing sent to BC', async (_name, credit, reason) => {
  const { server, orders, created } = fakeServer({ ...DELIVERY, paymentMethod: 'credit' }, { credit })
  expect(JSON.parse(await load(server).post())).toEqual({ pending: true })
  expect(orders()).toEqual([])
  expect(created).toHaveLength(1)
  const { set, row } = created[0]
  expect(set).toBe('chp_creditapprovals')
  expect(row).toMatchObject({
    chp_name: 'C00000002 · PO-8915', chp_status: 775000000, chp_reason: reason,
    chp_estimatedtotal: 11250, chp_availablecredit: credit.availableCredit, chp_overdueamount: credit.overdueAmount,
    chp_poref: 'PO-8915', chp_site: '65072350',
    'chp_Contact@odata.bind': '/contacts(c-1)', 'chp_Account@odata.bind': '/accounts(acc-2)',
  })
  const payload = JSON.parse(row.chp_payload as string)
  expect(payload).toMatchObject({ version: 1, companyId: 'co-1', lines: [{ code: '100016', qty: 50, uom: 'BAG/40', unitPrice: 210, amount: 10500 }] })
  expect(payload.salesOrder).toMatchObject({ sellToCustomerNo: 'C00000002', shipmentMethodCode: 'DELIVERY', paymentMethodCode: 'CREDIT', shiptoCode: '65072350' })
})

test('a held pick up order stores the plant as its site and the date as its name without a PO', async () => {
  const { server, created } = fakeServer({ ...CREDIT, poRef: '' }, { credit: { overdueAmount: 1, availableCredit: 50000 } })
  expect(JSON.parse(await load(server).post())).toEqual({ pending: true })
  expect(created[0].row).toMatchObject({ chp_site: 'SOLID', chp_name: 'C00000002 · 2026-10-26', chp_poref: '' })
})

test.each([
  ['credit figures missing', { credit: null }],
  ['credit read fails', { creditFails: true }],
  ['past due amount missing', { credit: { availableCredit: 50000 } }],
])(
  '%s: safe error, no order, nothing held',
  async (_n, opts) => {
    const { server, orders, created } = fakeServer(CREDIT, opts)
    await expect(load(server).post()).rejects.toThrow("We couldn't load this information. Please try again.")
    expect(orders()).toEqual([])
    expect(created).toEqual([])
  },
)

test('cash ignores credit: a past-due customer still gets the order and the overview is never read', async () => {
  const { server, orders, creditReads } = fakeServer(PICKUP, { credit: { overdueAmount: 99, availableCredit: -1 } })
  expect(JSON.parse(await load(server).post())).toEqual({ so: 'SOR000000024' })
  expect(orders()[0].body.paymentMethodCode).toBe('CASH')
  expect(creditReads()).toBe(0)
})
