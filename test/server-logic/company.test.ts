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
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })

function fakeServer({
  user = { contactid: 'c-1' } as unknown,
  email = 'Buyer@Bestrade.ph' as unknown,
  account = { name: 'BESTRADE COMMODITY SALES CORP.', chp_bccustomerno: 'C00000009', chp_bccompanyid: 'co-1' } as unknown,
  portalContacts = [{ companyNo: 'CT0001' }] as unknown[],
  relations = [{ vendorNo: 'C00000009' }] as unknown[],
  rows = [ROW] as unknown[],
  tokenStatus = 200,
  tokenResponse = undefined as unknown,
  bcDown = false,
  settings = SETTINGS,
  context = { ServerLogicName: 'company', QueryParameters: {}, Body: '' } as unknown,
} = {}) {
  const http: { method: string; url: string; body?: string; headers?: unknown; contentType?: string }[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const server = {
    User: user,
    Context: context,
    SiteSetting: { Get: (name: string) => settings[name] },
    Logger: { Log() {}, Error: (m: string) => errors.push(m), Warn: (m: string) => warnings.push(m) },
    Connector: {
      Dataverse: { RetrieveRecord: () => ({ contactid: 'c-1', emailaddress1: email, parentcustomerid_account: account }) },
      HttpClient: {
        PostAsync: async (url: string, body: string, headers: unknown, contentType: string) => {
          http.push({ method: 'POST', url, body, headers, contentType })
          return JSON.stringify(
            tokenResponse ?? { StatusCode: tokenStatus, IsSuccessStatusCode: tokenStatus < 400, Body: JSON.stringify({ access_token: 'tok-1' }) },
          )
        },
        GetAsync: async (url: string, headers: unknown) => {
          http.push({ method: 'GET', url, headers })
          if (bcDown) return JSON.stringify({ StatusCode: 503, IsSuccessStatusCode: false, ReasonPhrase: 'Service Unavailable', Body: '' })
          if (url.includes('/MCRMContacts')) return ok({ value: portalContacts })
          if (url.includes('/mcrmBusinessRelation')) return ok({ value: relations })
          return ok({ value: rows })
        },
      },
    },
  }
  return { server, http, errors, warnings }
}

const SAFE = "We couldn't load this information. Please try again."
const call = (http: { url: string }[], entity: string) => http.find((c) => c.url.includes(`/${entity}?`))!

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

// Power Pages form-encodes a JSON object body itself; a raw "a=b&c=d" string fails with
// "'g' is an invalid start of a value" (seen on Dev 2026-10-04; matches the Microsoft Learn Graph sample).
test('gets a client-credentials token, passing the form fields as a JSON object for the platform to encode', async () => {
  const { server, http } = fakeServer()
  await load(server).get()
  const token = http[0]
  expect(token.url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token')
  expect(token.contentType).toBe('application/x-www-form-urlencoded')
  expect(JSON.parse(token.body!)).toEqual({
    grant_type: 'client_credentials',
    client_id: 'client-1',
    client_secret: 's&x=1',
    scope: 'https://api.businesscentral.dynamics.com/.default',
  })
})

test("calls BC in the session's company with an escaped, encoded filter and the bearer token", async () => {
  const { server, http } = fakeServer({
    account: { name: 'X', chp_bccustomerno: "O'1 2", chp_bccompanyid: 'co-1' },
    relations: [{ vendorNo: "O'1 2" }],
    rows: [{ ...ROW, Customer_No: "O'1 2" }],
  })
  await load(server).get()
  const get = call(http, 'mcrmCustomers')
  expect(get.url).toBe(
    "https://api.businesscentral.dynamics.com/v2.0/tenant-1/DEV/api/pasi/mcrm/v1.0/companies(co-1)/mcrmCustomers?$filter=Customer_No%20eq%20'O''1%202'&$select=Customer_No%2CName%2CAddress%2CAddress_2%2CCity%2CCounty%2CPost_Code%2CVATRegNo%2CPhone_No%2CEMail",
  )
  expect(get.headers).toEqual({ Authorization: 'Bearer tok-1', Accept: 'application/json' })
})

test('ignores customer, company or email values sent in the request', async () => {
  const { server, http } = fakeServer({
    context: {
      ServerLogicName: 'company',
      QueryParameters: { customerNo: 'C99', companyId: 'other', email: 'evil@x.ph' },
      Body: '{"customerNo":"C99","email":"evil@x.ph"}',
    },
  })
  await load(server).get()
  expect(call(http, 'mcrmCustomers').url).toContain('companies(co-1)/')
  expect(call(http, 'mcrmCustomers').url).toContain("'C00000009'")
  expect(http.map((c) => c.url).join(' ')).not.toMatch(/C99|evil/)
})

test('checks BC portal access with the Dataverse email, lower-cased and quoted, only portal-enabled contacts', async () => {
  const { server, http } = fakeServer({ email: "O'Neil@Bestrade.PH" })
  await load(server).get()
  expect(decodeURIComponent(call(http, 'MCRMContacts').url)).toContain(
    "$filter=tolower(eMail) eq 'o''neil@bestrade.ph' and customerPortalAccess eq true",
  )
  expect(decodeURIComponent(call(http, 'mcrmBusinessRelation').url)).toContain(
    "$filter=(contactNo eq 'CT0001') and linktoTable eq 'Customer'",
  )
})

test.each([
  ['no BC contact with portal access for this email', { portalContacts: [] }],
  ['portal-enabled contacts belong to another customer', { relations: [{ vendorNo: 'C00000001' }] }],
  ['the contact has no email', { email: '' }],
])('blocked when %s: returns {blocked:true} and reads no customer data', async (_case, options) => {
  const { server, http, warnings } = fakeServer(options as Parameters<typeof fakeServer>[0])
  expect(JSON.parse(await load(server).get())).toEqual({ blocked: true })
  expect(http.some((c) => c.url.includes('/mcrmCustomers'))).toBe(false)
  expect(warnings.join(' ')).toContain('blocked')
})

test.each([
  ['BC returns a different customer', { rows: [{ ...ROW, Customer_No: 'C00000001' }] }],
  ['BC returns no customer', { rows: [] }],
  ['nobody is signed in', { user: null }],
  ['the contact has no linked account', { account: null }],
  ['BC rejects the client credentials', { tokenStatus: 401 }],
  ['a BC site setting is missing', { settings: { ...SETTINGS, 'BC/ClientSecret': '' } }],
  ['BC is down during the access check (an error, never "blocked")', { bcDown: true }],
])('%s → only the customer-safe error', async (_case, options) => {
  const { server } = fakeServer(options as Parameters<typeof fakeServer>[0])
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

test('makes no BC call when nobody is signed in', async () => {
  const { server, http } = fakeServer({ user: null })
  await expect(load(server).get()).rejects.toThrow(SAFE)
  expect(http).toEqual([])
})

// Seen on Dev 2026-10-04: the log only said "bc-0" — status 0 means the call never got an HTTP answer.
test('a call that gets no HTTP answer logs the failing step and the platform reason, with secrets removed', async () => {
  const { server, errors } = fakeServer({
    tokenResponse: {
      StatusCode: 0, IsSuccessStatusCode: false, ReasonPhrase: null, ServerError: true,
      ServerErrorMessage:
        'Request to login.microsoftonline.com failed: client_secret=s%26x%3D1 {"client_secret": "s&x=1"} Authorization: Bearer abc.def.ghi',
    },
  })
  await expect(load(server).get()).rejects.toThrow(SAFE)
  expect(errors).toHaveLength(1)
  expect(errors[0]).toContain('token')
  expect(errors[0]).toContain('Request to login.microsoftonline.com failed')
  expect(errors[0]).not.toContain('s%26x%3D1')
  expect(errors[0]).not.toContain('s&x=1')
  expect(errors[0]).not.toContain('abc.def.ghi')
})

// Seen on Dev 2026-10-04: "token 401 Unauthorized" alone doesn't say why Microsoft rejected the credentials.
test("a rejected token request logs Microsoft's error code and description", async () => {
  const { server, errors } = fakeServer({
    tokenResponse: {
      StatusCode: 401, IsSuccessStatusCode: false, ReasonPhrase: 'Unauthorized',
      Body: JSON.stringify({ error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.' }),
    },
  })
  await expect(load(server).get()).rejects.toThrow(SAFE)
  expect(errors[0]).toContain('token 401 Unauthorized')
  expect(errors[0]).toContain('AADSTS7000215')
})
