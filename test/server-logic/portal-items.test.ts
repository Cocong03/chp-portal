import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/portal-items/portal-items.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'client-1', 'BC/ClientSecret': 'secret-1',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })
// BC's mcrmPortalItems (S3-01, 2026-10-22): unitPrice is always 0 — the price comes from Custom Sales Price via the quote.
const ITEMS = [
  { itemNo: '100016', description: 'ISLAND PORTLAND CEMENT TYPE 1 40 KGS', baseUnitOfMeasure: 'BAG/40', salesUnitOfMeasure: 'BAG/40', unitPrice: 0, islandItem: true },
  { itemNo: '100014', description: 'APO PORTLAND TERNARY T1T 40 KGS', baseUnitOfMeasure: 'BAG/40', salesUnitOfMeasure: 'BAG/40', unitPrice: 0, islandItem: false },
  { itemNo: '100017', description: 'ISLAND PORTLAND CEMENT TYPE 1 BULK', baseUnitOfMeasure: 'TN', salesUnitOfMeasure: '', unitPrice: 0, islandItem: true },
]

function fakeServer({ items = ITEMS as unknown[], bcDown = false } = {}) {
  const http: string[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: { ServerLogicName: 'portal-items', QueryParameters: {}, Body: '' },
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
          if (plain.includes('/MCRMContacts')) return ok({ value: [{ companyNo: 'CT1', name: 'ERLINDA' }] })
          if (plain.includes('/mcrmBusinessRelation')) return ok({ value: [{ vendorNo: 'C00000002' }] })
          if (bcDown) return JSON.stringify({ StatusCode: 503, IsSuccessStatusCode: false, ReasonPhrase: 'Service Unavailable', Body: '' })
          return ok({ value: items })
        },
      },
    },
  }
  return { server, http }
}

test("lists BC's portal items by item no. in the sales unit, with no price until the quote (S3-06)", async () => {
  const { server, http } = fakeServer()
  expect(JSON.parse(await load(server).get())).toEqual([
    { code: '100014', description: 'APO PORTLAND TERNARY T1T 40 KGS', uom: 'BAG/40', unitPrice: null },
    { code: '100016', description: 'ISLAND PORTLAND CEMENT TYPE 1 40 KGS', uom: 'BAG/40', unitPrice: null },
    { code: '100017', description: 'ISLAND PORTLAND CEMENT TYPE 1 BULK', uom: 'TN', unitPrice: null },
  ])
  expect(http.find((u) => u.includes('/mcrmPortalItems?'))).toContain('/companies(co-1)/mcrmPortalItems?$select=itemNo,description,baseUnitOfMeasure,salesUnitOfMeasure')
})

test('rows without an item no. are dropped', async () => {
  const { server } = fakeServer({ items: [{ itemNo: '', description: 'Blank' }, ITEMS[1]] })
  expect(JSON.parse(await load(server).get()).map((item: { code: string }) => item.code)).toEqual(['100014'])
})

test('BC down → only the customer-safe error', async () => {
  const { server } = fakeServer({ bcDown: true })
  await expect(load(server).get()).rejects.toThrow("We couldn't load this information. Please try again.")
})

test('only the ordering roles can call it', () => {
  const yml = readFileSync(resolve('.powerpages-site/server-logic/portal-items/portal-items.serverlogic.yml'), 'utf8')
  expect(yml).toContain('name: portal-items')
  expect(yml.split('\n').map((line) => line.trim()).filter((line) => /^- [0-9a-f-]{36}$/.test(line))).toEqual([
    '- 56b29291-b981-4ef0-865b-41c1e9523a97',
    '- 11bb7218-55fb-4cae-b8a1-5af2f41237c5',
  ])
})
