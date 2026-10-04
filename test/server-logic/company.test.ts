import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/company/company.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1',
  'BC/EnvironmentName': 'DEV',
  'BC/ApiBasePath': '/api/pasi/mcrm/v1.0',
  'BC/ClientId': 'client-1',
  'BC/ClientSecret': 's&x=1',
}
const ROW = {
  Customer_No: 'C00000009', Name: 'BESTRADE COMMODITY SALES CORP.', Address: '12 Main St', Address_2: '', City: 'Pasig',
  County: 'NCR', Post_Code: '1600', VATRegNo: '123-456', Phone_No: '0917', EMail: 'ops@bestrade.ph',
}

function fakeServer({
  user = { contactid: 'c-1' } as unknown,
  account = { name: 'BESTRADE COMMODITY SALES CORP.', chp_bccustomerno: 'C00000009', chp_bccompanyid: 'co-1' } as unknown,
  rows = [ROW] as unknown[],
  tokenStatus = 200,
  settings = SETTINGS,
  context = { ServerLogicName: 'company', QueryParameters: {}, Body: '' } as unknown,
} = {}) {
  const http: { method: string; url: string; body?: string; headers?: unknown; contentType?: string }[] = []
  const server = {
    User: user,
    Context: context,
    Sitesetting: { Get: (name: string) => settings[name] },
    Logger: { Log() {}, Error() {}, Warn() {} },
    Connector: {
      Dataverse: { RetrieveRecord: () => ({ contactid: 'c-1', parentcustomerid_account: account }) },
      HttpClient: {
        PostAsync: async (url: string, body: string, headers: unknown, contentType: string) => {
          http.push({ method: 'POST', url, body, headers, contentType })
          return JSON.stringify({ StatusCode: tokenStatus, IsSuccessStatusCode: tokenStatus < 400, Body: JSON.stringify({ access_token: 'tok-1' }) })
        },
        GetAsync: async (url: string, headers: unknown) => {
          http.push({ method: 'GET', url, headers })
          return JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify({ value: rows }) })
        },
      },
    },
  }
  return { server, http }
}

const SAFE = "We couldn't load this information. Please try again."

test("returns the signed-in customer's BC card in the wireframe's field names", async () => {
  const { server } = fakeServer()
  expect(JSON.parse(await load(server).get())).toEqual({
    customerNo: 'C00000009',
    customerName: 'BESTRADE COMMODITY SALES CORP.',
    address: '12 Main St, Pasig, NCR, 1600',
    vatRegNumber: '123-456',
    phone: '0917',
    email: 'ops@bestrade.ph',
  })
})

test('gets a client-credentials token with every form value URL-encoded', async () => {
  const { server, http } = fakeServer()
  await load(server).get()
  const token = http[0]
  expect(token.url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token')
  expect(token.contentType).toBe('application/x-www-form-urlencoded')
  expect(token.body).toBe(
    'grant_type=client_credentials&client_id=client-1&client_secret=s%26x%3D1&scope=https%3A%2F%2Fapi.businesscentral.dynamics.com%2F.default',
  )
})

test("calls BC in the session's company with an escaped, encoded filter and the bearer token", async () => {
  const { server, http } = fakeServer({ account: { name: 'X', chp_bccustomerno: "O'1 2", chp_bccompanyid: 'co-1' }, rows: [{ ...ROW, Customer_No: "O'1 2" }] })
  await load(server).get()
  const get = http[1]
  expect(get.url).toBe(
    "https://api.businesscentral.dynamics.com/v2.0/tenant-1/DEV/api/pasi/mcrm/v1.0/companies(co-1)/mcrmCustomers?$filter=Customer_No%20eq%20'O''1%202'&$select=Customer_No%2CName%2CAddress%2CAddress_2%2CCity%2CCounty%2CPost_Code%2CVATRegNo%2CPhone_No%2CEMail",
  )
  expect(get.headers).toEqual({ Authorization: 'Bearer tok-1', Accept: 'application/json' })
})

test('ignores customer or company ids sent in the request', async () => {
  const { server, http } = fakeServer({
    context: { ServerLogicName: 'company', QueryParameters: { customerNo: 'C99', companyId: 'other' }, Body: '{"customerNo":"C99"}' },
  })
  await load(server).get()
  expect(http[1].url).toContain('companies(co-1)/')
  expect(http[1].url).toContain("'C00000009'")
  expect(http[1].url).not.toContain('C99')
})

test.each([
  ['BC returns a different customer', { rows: [{ ...ROW, Customer_No: 'C00000001' }] }],
  ['BC returns no customer', { rows: [] }],
  ['nobody is signed in', { user: null }],
  ['the contact has no linked account', { account: null }],
  ['BC rejects the client credentials', { tokenStatus: 401 }],
  ['a BC site setting is missing', { settings: { ...SETTINGS, 'BC/ClientSecret': '' } }],
])('%s → only the customer-safe error', async (_case, options) => {
  const { server } = fakeServer(options as Parameters<typeof fakeServer>[0])
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

test('makes no BC call when nobody is signed in', async () => {
  const { server, http } = fakeServer({ user: null })
  await expect(load(server).get()).rejects.toThrow(SAFE)
  expect(http).toEqual([])
})
