import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/documents/documents.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1',
  'BC/EnvironmentName': 'DEV',
  'BC/ApiBasePath': '/api/pasi/mcrm/v1.0',
  'BC/ClientId': 'client-1',
  'BC/ClientSecret': 'secret-1',
}
// BC's portalDocuments fields (probed on DEV); BC encodes spaces in enum values as _x0020_.
const DOC = {
  customerNo: 'C00000002', documentType: 'Invoice', documentNo: 'PPSIN0000000001', salesOrderNo: '',
  postingDate: '2026-09-12', externalDocumentNo: 'PO2', amount: 12500,
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })

function fakeServer({
  query = {} as Record<string, string>,
  docs = [DOC] as unknown[],
  count = 1 as number | undefined,
  search = {} as Record<string, unknown[]>,
  bcDown = false,
} = {}) {
  const http: string[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: { ServerLogicName: 'documents', QueryParameters: query, Body: '' },
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
          const term = Object.keys(search).find((t) => plain.includes(t))
          if (term) return ok({ value: search[term] })
          return ok(count === undefined ? { value: docs } : { value: docs, '@odata.count': count })
        },
      },
    },
  }
  return { server, http }
}

const SAFE = "We couldn't load this information. Please try again."
const docCalls = (http: string[]) => http.filter((u) => u.includes('/portalDocuments?'))
const BASE = "customerNo eq 'C00000002'"
const refs = (page: { documents: { ref: string }[] }) => page.documents.map((d) => d.ref)

test("lists the session customer's documents newest first, 10 per page, with the total", async () => {
  const { server, http } = fakeServer({ count: 23 })
  const page = JSON.parse(await load(server).get())
  expect(page).toMatchObject({ total: 23, page: 1, pageSize: 10 })
  const call = docCalls(http)[0]
  expect(call).toContain(`$filter=${BASE}&`)
  expect(call).toContain('$orderby=postingDate desc,documentNo desc')
  expect(call).toContain('$top=10')
  expect(call).toContain('$skip=0')
  expect(call).toContain('$count=true')
})

test("type, dates and page narrow it; display type sent as BC's name", async () => {
  const { server, http } = fakeServer({ query: { type: 'Delivery Receipt', from: '2026-09-01', to: '2026-09-30', page: '3' } })
  await load(server).get()
  const call = docCalls(http)[0]
  expect(call).toContain(`$filter=${BASE} and documentType eq 'Delivery_x0020_Receipt' and postingDate ge 2026-09-01 and postingDate le 2026-09-30&`)
  expect(call).toContain('$skip=20')
})

test('an unknown type answers an empty page without calling BC', async () => {
  const { server, http } = fakeServer({ query: { type: 'Statement' } })
  expect(JSON.parse(await load(server).get())).toMatchObject({ documents: [], total: 0 })
  expect(docCalls(http)).toEqual([])
})

test('impossible dates are dropped', async () => {
  const { server, http } = fakeServer({ query: { from: '2026-02-30' } })
  await load(server).get()
  expect(docCalls(http)[0]).toContain(`$filter=${BASE}&`)
  expect(docCalls(http)[0]).not.toContain('2026-02-30')
})

test('customer or company values in the request are ignored', async () => {
  const { server, http } = fakeServer({ query: { customerNo: 'C99', companyId: 'other' } })
  await load(server).get()
  expect(http.join(' ')).not.toMatch(/C99|other/)
})

test('drops rows BC returns for another customer', async () => {
  const { server } = fakeServer({ docs: [DOC, { ...DOC, documentNo: 'X9', customerNo: 'C1' }], count: 2 })
  expect(refs(JSON.parse(await load(server).get()))).toEqual(['PPSIN0000000001'])
})

test('maps BC rows', async () => {
  const receipt = { ...DOC, documentType: 'Delivery_x0020_Receipt', documentNo: 'DR1', salesOrderNo: 'SOR000000016', amount: 0 }
  const zero = { ...DOC, documentNo: 'PPSIN2', amount: 0 }
  const refund = { ...DOC, documentNo: 'R1', documentType: 'Refund' }
  const { server } = fakeServer({ docs: [DOC, receipt, zero, refund], count: 4 })
  const [inv, dr, z, r] = JSON.parse(await load(server).get()).documents
  expect(inv).toEqual({ type: 'Invoice', ref: 'PPSIN0000000001', soNo: null, poRef: 'PO2', date: '2026-09-12', amount: 12500 })
  expect(dr).toMatchObject({ type: 'Delivery Receipt', amount: null, soNo: 'SOR000000016' })
  expect(z.amount).toBe(0)
  expect(r.type).toBe('Refund')
})

test('search: three fields in upper case, merged, de-duplicated by type + number, newest first, paged', async () => {
  const older = { ...DOC, documentNo: 'SPIN1', postingDate: '2026-08-01' }
  const newer = { ...DOC, documentNo: 'SPIN2', postingDate: '2026-09-12' }
  const sameNo = { ...DOC, documentType: 'Delivery_x0020_Receipt', documentNo: 'SPIN2', amount: 0 }
  const { server, http } = fakeServer({
    query: { q: 'spin' },
    search: {
      "contains(documentNo,'SPIN')": [older, newer],
      "contains(salesOrderNo,'SPIN')": [newer],
      "contains(externalDocumentNo,'SPIN')": [sameNo],
    },
    docs: [],
  })
  const page = JSON.parse(await load(server).get())
  expect(page.total).toBe(3)
  expect(page.documents.map((d: { type: string; ref: string }) => `${d.type}:${d.ref}`).sort()).toEqual(['Delivery Receipt:SPIN2', 'Invoice:SPIN1', 'Invoice:SPIN2'])
  expect(page.documents[2].ref).toBe('SPIN1')
  const calls = docCalls(http)
  expect(calls).toHaveLength(3)
  for (const f of ['documentNo', 'salesOrderNo', 'externalDocumentNo']) {
    expect(calls.some((c) => c.includes(`$filter=${BASE} and contains(${f},'SPIN')&`))).toBe(true)
  }
  for (const c of calls) expect(c).toContain('$top=200')
})

test('search pages the merged results in the endpoint', async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ ...DOC, documentNo: `SIN${String(i).padStart(3, '0')}`, postingDate: `2026-09-${String(i + 1).padStart(2, '0')}` }))
  const { server } = fakeServer({ query: { q: 'SIN', page: '2' }, search: { "contains(documentNo,'SIN')": many }, docs: [] })
  const page = JSON.parse(await load(server).get())
  expect(page).toMatchObject({ total: 12, page: 2 })
  expect(refs(page)).toEqual(['SIN001', 'SIN000'])
})

test('a quote in the search is doubled', async () => {
  const { server, http } = fakeServer({ query: { q: "po'1" }, docs: [] })
  await load(server).get()
  expect(docCalls(http).some((c) => c.includes("contains(externalDocumentNo,'PO''1')"))).toBe(true)
})

test('all=true returns every match in one answer', async () => {
  const { server, http } = fakeServer({ query: { all: 'true' }, docs: [DOC, { ...DOC, documentNo: 'B' }], count: 99 })
  const page = JSON.parse(await load(server).get())
  expect(page).toMatchObject({ total: 2, page: 1, pageSize: 2 })
  const call = docCalls(http)[0]
  expect(call).toContain('$top=5000')
  expect(call).not.toMatch(/\$skip|\$count/)
})

test('BC down → only the customer-safe error', async () => {
  const { server } = fakeServer({ bcDown: true })
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

test('only Full Access and Finance & Documents can call it', () => {
  const yml = readFileSync(resolve('.powerpages-site/server-logic/documents/documents.serverlogic.yml'), 'utf8')
  expect(yml).toContain('name: documents')
  expect(yml.split('\n').map((line) => line.trim()).filter((line) => /^- [0-9a-f-]{36}$/.test(line))).toEqual([
    '- 56b29291-b981-4ef0-865b-41c1e9523a97',
    '- c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3',
  ])
})
