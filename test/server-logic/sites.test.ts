import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/sites/sites.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1',
  'BC/EnvironmentName': 'DEV',
  'BC/ApiBasePath': '/api/pasi/mcrm/v1.0',
  'BC/ClientId': 'client-1',
  'BC/ClientSecret': 'secret-1',
}
// BC DEV field names (probed 2026-10-08): camelCase, and documentNo holds the customer no.
const SHIP_TO = {
  documentNo: 'C00000009', code: 'PLANT2', name: 'Plant 2 — North Depot', address: 'National Highway', address2: 'Brgy. Sta. Cruz',
  city: 'Angat', postCode: '3012', contact: 'Ligaya Fernandez', phoneNo: '(044) 815-2207',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })

function fakeServer({
  account = { accountid: 'acc-1', name: 'BESTRADE', chp_bccustomerno: 'C00000009', chp_bccompanyid: 'co-1' } as unknown,
  shipTos = [SHIP_TO, { ...SHIP_TO, code: 'PLANT1', name: 'Plant 1 — Main Yard' }] as unknown[],
  bcDown = false,
  context = { ServerLogicName: 'sites', QueryParameters: {}, Body: '' } as unknown,
} = {}) {
  const http: { url: string }[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: context,
    SiteSetting: { Get: (name: string) => SETTINGS[name] },
    Logger: { Log() {}, Error() {}, Warn() {} },
    Connector: {
      Dataverse: { RetrieveRecord: () => ({ contactid: 'c-1', emailaddress1: 'buyer@bestrade.ph', parentcustomerid_account: account }) },
      HttpClient: {
        PostAsync: async () => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify({ access_token: 'tok-1' }) }),
        GetAsync: async (url: string) => {
          http.push({ url })
          if (url.includes('/MCRMContacts')) return ok({ value: [{ companyNo: 'CT0001' }] })
          if (url.includes('/mcrmBusinessRelation')) return ok({ value: [{ vendorNo: (account as { chp_bccustomerno: string }).chp_bccustomerno }] })
          if (bcDown) return JSON.stringify({ StatusCode: 503, IsSuccessStatusCode: false, ReasonPhrase: 'Service Unavailable', Body: '' })
          return ok({ value: shipTos })
        },
      },
    },
  }
  return { server, http }
}

const SAFE = "We couldn't load this information. Please try again."
const decoded = (http: { url: string }[], entity: string) => decodeURIComponent(http.find((c) => c.url.includes(`/${entity}?`))!.url)

test("returns the session customer's ship-tos in the wireframe's SITES shape, sorted by code", async () => {
  const { server } = fakeServer()
  expect(JSON.parse(await load(server).get())).toEqual([
    {
      code: 'PLANT1', name: 'Plant 1 — Main Yard', address: 'National Highway, Brgy. Sta. Cruz', city: 'Angat, 3012',
      contact: 'Ligaya Fernandez', phone: '(044) 815-2207', email: '', isDefault: false,
    },
    {
      code: 'PLANT2', name: 'Plant 2 — North Depot', address: 'National Highway, Brgy. Sta. Cruz', city: 'Angat, 3012',
      contact: 'Ligaya Fernandez', phone: '(044) 815-2207', email: '', isDefault: false,
    },
  ])
})

test('joins address parts without blanks', async () => {
  const { server } = fakeServer({ shipTos: [{ ...SHIP_TO, address2: '  ', postCode: null }] })
  const [site] = JSON.parse(await load(server).get())
  expect(site.address).toBe('National Highway')
  expect(site.city).toBe('Angat')
})

test('filters ship-tos on the session customer, quotes doubled', async () => {
  const { server, http } = fakeServer({
    account: { accountid: 'acc-1', name: 'X', chp_bccustomerno: "O'1 2", chp_bccompanyid: 'co-1' },
    shipTos: [{ ...SHIP_TO, documentNo: "O'1 2" }],
  })
  await load(server).get()
  expect(decoded(http, 'mcrmShipToAddress')).toContain("companies(co-1)/mcrmShipToAddress?$filter=documentNo eq 'O''1 2'")
})

test('ignores customer or company values sent in the request', async () => {
  const { server, http } = fakeServer({
    context: { ServerLogicName: 'sites', QueryParameters: { customerNo: 'C99', companyId: 'other' }, Body: '{"customerNo":"C99"}' },
  })
  await load(server).get()
  expect(http.map((c) => c.url).join(' ')).not.toMatch(/C99|other/)
})

test('drops a row that belongs to another customer', async () => {
  const { server } = fakeServer({ shipTos: [SHIP_TO, { ...SHIP_TO, documentNo: 'C00000001', code: 'ZZZ' }] })
  expect(JSON.parse(await load(server).get()).map((s: { code: string }) => s.code)).toEqual(['PLANT2'])
})

test('BC down → only the customer-safe error', async () => {
  const { server } = fakeServer({ bcDown: true })
  await expect(load(server).get()).rejects.toThrow(SAFE)
})
