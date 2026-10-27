import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// orders POST: Submit (S3-10). Cash orders only (credit is Phase 2, decided 2026-10-26), created as Open BC Sales Orders.
const source = readFileSync(resolve('.powerpages-site/server-logic/orders/orders.js'), 'utf8')
const load = (server: unknown): { post: () => Promise<string> } => new Function('Server', `${source}\nreturn { post }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'client-1', 'BC/ClientSecret': 'secret-1',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 201, IsSuccessStatusCode: true, Body: JSON.stringify(value) })
const PRICED = { unitPrice: 210, lineAmount: 10500, freightAmount: 500, fuelSurchargeAmount: 250, portChargesAmount: 0, totalAmount: 11250, message: '' }
const BASE = 'https://api.businesscentral.dynamics.com/v2.0/tenant-1/DEV/api/pasi/mcrm/v1.0/companies(co-1)/'

function fakeServer(body: unknown, { quote = PRICED as unknown, blocked = false, orderFails = false } = {}) {
  const posts: { entity: string; body: Record<string, unknown> }[] = []
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
          return ok({ value: [] })
        },
      },
    },
  }
  return { server, posts, orders: () => posts.filter((post) => post.entity === 'mcrmSalesOrders') }
}

const LINE = { code: '100016', uom: 'BAG/40', qty: 50 }
const PICKUP = {
  shipmentMethod: 'pickup', source: 'SOLID', site: 'PLANT2', lines: [LINE], paymentMethod: 'cash', poRef: 'PO-8915',
  pickupDate: '2026-10-27', requestedDate: '2026-10-28', receivingPerson: 'Juan', receivingContact: '0917', receivingEmail: 'juan@test.ph',
  timeWindow: 'DAY', instructions: 'Loading type: Loose pile. Call before delivery: No.',
}
const DELIVERY = { ...PICKUP, shipmentMethod: 'delivery', site: '65072350' }
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
  ['credit payment (Phase 2)', { paymentMethod: 'credit' }],
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
