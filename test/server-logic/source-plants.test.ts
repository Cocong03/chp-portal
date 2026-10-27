import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/source-plants/source-plants.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'client-1', 'BC/ClientSecret': 'secret-1',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })
// BC's mcrmSourcePlants (delivered 2026-10-23).
const PLANTS = [
  { code: 'SOLID', name: 'SOLID PLANT', address: '' },
  { code: 'CAVITE', name: 'CAVITE WAREHOUSE', address: '' },
  { code: 'STA. CRUZ', name: 'STA. CRUZ WAREHOUSE', address: '' },
]

function fakeServer({ plants = PLANTS as unknown[], bcDown = false } = {}) {
  const http: string[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: { ServerLogicName: 'source-plants', QueryParameters: {}, Body: '' },
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
          return ok({ value: plants })
        },
      },
    },
  }
  return { server, http }
}

test("lists BC's source plants as code and name, sorted by code, from the session's company", async () => {
  const { server, http } = fakeServer()
  expect(JSON.parse(await load(server).get())).toEqual([
    { code: 'CAVITE', name: 'CAVITE WAREHOUSE' },
    { code: 'SOLID', name: 'SOLID PLANT' },
    { code: 'STA. CRUZ', name: 'STA. CRUZ WAREHOUSE' },
  ])
  const call = http.find((u) => u.includes('/mcrmSourcePlants?'))!
  expect(call).toContain('/companies(co-1)/mcrmSourcePlants?$select=code,name')
})

test('rows without a code are dropped', async () => {
  const { server } = fakeServer({ plants: [{ code: '', name: 'Blank' }, PLANTS[0]] })
  expect(JSON.parse(await load(server).get())).toEqual([{ code: 'SOLID', name: 'SOLID PLANT' }])
})

test('BC down → only the customer-safe error', async () => {
  const { server } = fakeServer({ bcDown: true })
  await expect(load(server).get()).rejects.toThrow("We couldn't load this information. Please try again.")
})

test('only the ordering roles can call it', () => {
  const yml = readFileSync(resolve('.powerpages-site/server-logic/source-plants/source-plants.serverlogic.yml'), 'utf8')
  expect(yml).toContain('name: source-plants')
  expect(yml.split('\n').map((line) => line.trim()).filter((line) => /^- [0-9a-f-]{36}$/.test(line))).toEqual([
    '- 56b29291-b981-4ef0-865b-41c1e9523a97',
    '- 11bb7218-55fb-4cae-b8a1-5af2f41237c5',
  ])
})
