import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/order-quote/order-quote.js'), 'utf8')
const load = (server: unknown): { post: () => Promise<string> } => new Function('Server', `${source}\nreturn { post }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'client-1', 'BC/ClientSecret': 'secret-1',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 201, IsSuccessStatusCode: true, Body: JSON.stringify(value) })

// BC's portalPriceQuotes answers as tested on Dev 2026-10-23 (C00000002, 100016, SOLID, BAG/40, 50).
const PICKUP_ROW = {
  unitPrice: 187, lineAmount: 9350, freightUnitAmount: 0, freightAmount: 0, fuelSurchargeUnitAmount: 0, fuelSurchargeAmount: 0,
  portChargesUnitAmount: 0, portChargesAmount: 0, chargeRateMissing: false, totalAmount: 9350, message: '', priceSource: 'Pick-up Pricing',
}
const DELIVERY_ROW = {
  unitPrice: 210, lineAmount: 10500, freightUnitAmount: 10, freightAmount: 500, fuelSurchargeUnitAmount: 5, fuelSurchargeAmount: 250,
  portChargesUnitAmount: 0, portChargesAmount: 0, chargeRateMissing: false, totalAmount: 11250, message: '', priceSource: 'Custom Sales Price',
}

function fakeServer(body: unknown, { rows = [PICKUP_ROW] as unknown[], bcDown = false } = {}) {
  const posts: { url: string; body: Record<string, unknown> }[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: { ServerLogicName: 'order-quote', QueryParameters: {}, Body: JSON.stringify(body) },
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
          posts.push({ url, body: JSON.parse(text) })
          if (bcDown) return JSON.stringify({ StatusCode: 400, IsSuccessStatusCode: false, ReasonPhrase: 'Bad Request', Body: '' })
          return ok(rows[(posts.length - 1) % rows.length])
        },
        GetAsync: async (url: string) => {
          const plain = decodeURIComponent(url)
          if (plain.includes('/MCRMContacts')) return ok({ value: [{ companyNo: 'CT1', name: 'ERLINDA' }] })
          if (plain.includes('/mcrmBusinessRelation')) return ok({ value: [{ vendorNo: 'C00000002' }] })
          return ok({ value: [] })
        },
      },
    },
  }
  return { server, posts }
}

const PICKUP = { shipmentMethod: 'pickup', source: 'SOLID', site: 'PLANT2', lines: [{ code: '100016', uom: 'BAG/40', qty: 50 }] }

afterEach(() => vi.useRealTimers())

test("one BC quote per line, for the session's customer, dated today in the Philippines", async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-23T17:30:00Z')) // 01:30 on Oct 24 in Manila
  const { server, posts } = fakeServer({ ...PICKUP, customerNo: 'C99999999' })
  await load(server).post()
  expect(posts).toEqual([{
    url: 'https://api.businesscentral.dynamics.com/v2.0/tenant-1/DEV/api/pasi/mcrm/v1.0/companies(co-1)/portalPriceQuotes',
    body: {
      customerNo: 'C00000002', itemNo: '100016', sourcePlant: 'SOLID', shipmentMethodCode: 'PICKUP', shipToCode: '',
      unitOfMeasureCode: 'BAG/40', quantity: 50, orderDate: '2026-10-24',
    },
  }])
})

test('delivery sends the delivery site; the answer is each line plus summed totals', async () => {
  const body = { ...PICKUP, shipmentMethod: 'delivery', site: '65072350', lines: [PICKUP.lines[0], { code: '100014', uom: 'BAG/40', qty: 50 }] }
  const { server, posts } = fakeServer(body, { rows: [DELIVERY_ROW, { ...DELIVERY_ROW, portChargesAmount: 100.1, totalAmount: 11350.1, message: 'Port charges apply.' }] })
  const quote = JSON.parse(await load(server).post())
  expect(posts.map((post) => [post.body.shipmentMethodCode, post.body.shipToCode, post.body.itemNo])).toEqual([
    ['DELIVERY', '65072350', '100016'],
    ['DELIVERY', '65072350', '100014'],
  ])
  expect(quote).toEqual({
    lines: [
      { unitPrice: 210, lineAmount: 10500, freight: 500, otherCharges: 250, total: 11250, message: '' },
      { unitPrice: 210, lineAmount: 10500, freight: 500, otherCharges: 350.1, total: 11350.1, message: 'Port charges apply.' },
    ],
    subtotal: 21000, freight: 1000, otherCharges: 600.1, total: 22600.1,
  })
})

test.each([
  ['an unknown shipment method', { ...PICKUP, shipmentMethod: 'courier' }],
  ['no lines', { ...PICKUP, lines: [] }],
  ['a zero quantity', { ...PICKUP, lines: [{ code: '100016', uom: 'BAG/40', qty: 0 }] }],
  ['a missing item', { ...PICKUP, lines: [{ code: '', uom: 'BAG/40', qty: 5 }] }],
  ['no source', { ...PICKUP, source: '' }],
  ['delivery without a site', { ...PICKUP, shipmentMethod: 'delivery', site: '' }],
  ['more than 50 lines', { ...PICKUP, lines: Array.from({ length: 51 }, () => PICKUP.lines[0]) }],
])('%s → no BC call, only the customer-safe error', async (_case, body) => {
  const { server, posts } = fakeServer(body)
  await expect(load(server).post()).rejects.toThrow("We couldn't load this information. Please try again.")
  expect(posts).toEqual([])
})

test('a line BC refuses → only the customer-safe error', async () => {
  const { server } = fakeServer(PICKUP, { bcDown: true })
  await expect(load(server).post()).rejects.toThrow("We couldn't load this information. Please try again.")
})

test('only the ordering roles can call it', () => {
  const yml = readFileSync(resolve('.powerpages-site/server-logic/order-quote/order-quote.serverlogic.yml'), 'utf8')
  expect(yml).toContain('name: order-quote')
  expect(yml.split('\n').map((line) => line.trim()).filter((line) => /^- [0-9a-f-]{36}$/.test(line))).toEqual([
    '- 56b29291-b981-4ef0-865b-41c1e9523a97',
    '- 11bb7218-55fb-4cae-b8a1-5af2f41237c5',
  ])
})
