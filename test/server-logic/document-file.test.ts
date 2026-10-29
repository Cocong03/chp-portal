import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/document-file/document-file.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1',
  'BC/EnvironmentName': 'DEV',
  'BC/ApiBasePath': '/api/pasi/mcrm/v1.0',
  'BC/ClientId': 'client-1',
  'BC/ClientSecret': 'secret-1',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })
const NOT_FOUND = JSON.stringify({
  StatusCode: 400, IsSuccessStatusCode: false, ReasonPhrase: 'Bad Request',
  Body: JSON.stringify({ error: { code: 'Application_DialogException', message: 'Invoice SPIN0000000001 was not found for customer C00000002. CorrelationId: x' } }),
})

function fakeServer({
  query = { type: 'Invoice', no: 'SPIN0000000001' } as Record<string, string>,
  owned = true,
  fileName = 'Invoice SPIN0000000001.pdf',
  pdfAnswer = undefined as string | undefined,
  bcDown = false,
} = {}) {
  const http: string[] = []
  const posts: string[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: { ServerLogicName: 'document-file', QueryParameters: query, Body: '' },
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
        PostAsync: async (url: string, body: string) => {
          if (url.includes('login.microsoftonline.com')) return ok({ access_token: 'tok-1' })
          posts.push(body)
          if (bcDown) return JSON.stringify({ StatusCode: 503, IsSuccessStatusCode: false, ReasonPhrase: 'Service Unavailable', Body: '' })
          return pdfAnswer ?? ok({ fileName, pdfBase64: 'JVBERi0x' })
        },
        GetAsync: async (url: string) => {
          const plain = decodeURIComponent(url)
          http.push(plain)
          if (plain.includes('/MCRMContacts')) return ok({ value: [{ companyNo: 'CT1', name: 'ERLINDA' }] })
          if (plain.includes('/mcrmBusinessRelation')) return ok({ value: [{ vendorNo: 'C00000002' }] })
          return ok({ value: owned ? [{ customerNo: 'C00000002', documentType: 'Invoice', documentNo: 'SPIN0000000001' }] : [] })
        },
      },
    },
  }
  return { server, http, posts }
}

const SAFE = "We couldn't load this information. Please try again."
const docCalls = (http: string[]) => http.filter((u) => u.includes('/portalDocuments?'))

test("checks the document is the session customer's, then returns BC's PDF as base64", async () => {
  const { server, http, posts } = fakeServer()
  const answer = JSON.parse(await load(server).get())
  expect(answer).toEqual({ fileName: 'Invoice SPIN0000000001.pdf', contentType: 'application/pdf', base64: 'JVBERi0x' })
  const calls = docCalls(http)
  expect(calls).toHaveLength(1)
  expect(calls[0]).toContain("$filter=customerNo eq 'C00000002' and documentType eq 'Invoice' and documentNo eq 'SPIN0000000001'")
  expect(calls[0]).toContain('$top=1')
  expect(posts.map((p) => JSON.parse(p))).toEqual([{ customerNo: 'C00000002', documentType: 'Invoice', documentNo: 'SPIN0000000001' }])
})

test('a display type goes to the ownership check as BC enum and to the PDF call as the display name', async () => {
  const { server, http, posts } = fakeServer({ query: { type: 'Delivery Receipt', no: 'DR1' } })
  await load(server).get()
  expect(docCalls(http)[0]).toContain("documentType eq 'Delivery_x0020_Receipt'")
  expect(JSON.parse(posts[0]).documentType).toBe('Delivery Receipt')
})

test('a request customer is ignored', async () => {
  const { server, posts } = fakeServer({ query: { type: 'Invoice', no: 'SPIN0000000001', customerNo: 'C99' } })
  await load(server).get()
  expect(JSON.parse(posts[0]).customerNo).toBe('C00000002')
})

test("not the session customer's → notFound and no PDF call", async () => {
  const { server, posts } = fakeServer({ owned: false })
  expect(JSON.parse(await load(server).get())).toEqual({ notFound: true })
  expect(posts).toEqual([])
})

test('BC\'s own "not found" → notFound', async () => {
  const { server } = fakeServer({ pdfAnswer: NOT_FOUND })
  expect(JSON.parse(await load(server).get())).toEqual({ notFound: true })
})

test('bad type or number never reaches BC', async () => {
  for (const query of [
    { type: 'Statement', no: 'SPIN1' },
    { type: 'Invoice', no: '' },
    { type: 'Invoice', no: 'A'.repeat(21) },
    { type: 'Invoice', no: "SPIN'01" },
    { type: 'Invoice', no: '../x' },
  ]) {
    const { server, http, posts } = fakeServer({ query })
    expect(JSON.parse(await load(server).get())).toEqual({ notFound: true })
    expect(docCalls(http)).toEqual([])
    expect(posts).toEqual([])
  }
})

test('a lower-case number is upper-cased and accepted', async () => {
  const { server, posts } = fakeServer({ query: { type: 'Invoice', no: 'spin0000000001' } })
  expect(JSON.parse(await load(server).get())).toMatchObject({ base64: 'JVBERi0x' })
  expect(JSON.parse(posts[0]).documentNo).toBe('SPIN0000000001')
})

test("file names lose characters Windows can't save", async () => {
  const { server } = fakeServer({ fileName: 'Invoice SPIN/01\\02:"x".pdf' })
  expect(JSON.parse(await load(server).get()).fileName).toBe('Invoice SPIN-01-02--x-.pdf')
})

test('BC answers an empty pdfBase64 → only the customer-safe error', async () => {
  const { server } = fakeServer({ pdfAnswer: ok({ fileName: 'x.pdf', pdfBase64: '' }) })
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

test('BC down → only the customer-safe error', async () => {
  const { server } = fakeServer({ bcDown: true })
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

test('only Full Access and Finance & Documents can call it', () => {
  const yml = readFileSync(resolve('.powerpages-site/server-logic/document-file/document-file.serverlogic.yml'), 'utf8')
  expect(yml).toContain('name: document-file')
  expect(yml.split('\n').map((line) => line.trim()).filter((line) => /^- [0-9a-f-]{36}$/.test(line))).toEqual([
    '- 56b29291-b981-4ef0-865b-41c1e9523a97',
    '- c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3',
  ])
})
