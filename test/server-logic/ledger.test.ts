import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/ledger/ledger.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1',
  'BC/EnvironmentName': 'DEV',
  'BC/ApiBasePath': '/api/pasi/mcrm/v1.0',
  'BC/ClientId': 'client-1',
  'BC/ClientSecret': 'secret-1',
}
// BC's mcrmCustLedgerEntries fields (S2-07, delivered 2026-10-22); BC encodes spaces in enum values as _x0020_.
const ENTRY = {
  Customer_No: 'C00000002', Posting_Date: '2026-09-12', Document_Type: 'Invoice', Document_No: 'SIN0000000003',
  External_Document_No: 'PO-8858', Description: 'September cement delivery', Due_Date: '2026-10-12',
  Amount: 63250, Remaining_Amount: 63250, Open: true, Entry_No: 1001,
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })

function fakeServer({
  query = {} as Record<string, string>,
  entries = [ENTRY] as unknown[],
  count = 1 as number | undefined,
  search = {} as Record<string, unknown[]>,
  bcDown = false,
} = {}) {
  const http: string[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: { ServerLogicName: 'ledger', QueryParameters: query, Body: '' },
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
          return ok(count === undefined ? { value: entries } : { value: entries, '@odata.count': count })
        },
      },
    },
  }
  return { server, http }
}

const SAFE = "We couldn't load this information. Please try again."
const ledgerCalls = (http: string[]) => http.filter((u) => u.includes('/mcrmCustLedgerEntries?'))
const BASE = "Customer_No eq 'C00000002'"
const EMPTY = { entries: [], total: 0, page: 1, pageSize: 10 }

test("lists the session customer's open entries newest first, 10 per page, with the total count", async () => {
  const { server, http } = fakeServer({ count: 23 })
  expect(JSON.parse(await load(server).get())).toEqual({
    entries: [{
      docNo: 'SIN0000000003', refPo: 'PO-8858', type: 'Invoice', desc: 'September cement delivery', postingDate: '2026-09-12',
      dueDate: '2026-10-12', original: 63250, remaining: 63250, status: 'Open',
    }],
    total: 23, page: 1, pageSize: 10,
  })
  const call = ledgerCalls(http)[0]
  expect(call).toContain(`$filter=${BASE} and Open eq true&`)
  expect(call).toContain('$orderby=Posting_Date desc,Entry_No desc')
  expect(call).toContain('$top=10')
  expect(call).toContain('$skip=0')
  expect(call).toContain('$count=true')
})

test('show=all drops the open filter; type, dates and page narrow it, quotes doubled', async () => {
  const { server, http } = fakeServer({ query: { show: 'all', type: 'Credit Memo', from: '2026-07-01', to: '2026-09-30', page: '3' } })
  await load(server).get()
  const call = ledgerCalls(http)[0]
  expect(call).toContain(`$filter=${BASE} and Document_Type eq 'Credit Memo' and Posting_Date ge 2026-07-01 and Posting_Date le 2026-09-30&`)
  expect(call).toContain('$skip=20')
})

test.each(['Refund', "x' or 1 eq 1"])('an unknown type (%s) answers an empty page and never reaches BC', async (type) => {
  const { server, http } = fakeServer({ query: { type } })
  expect(JSON.parse(await load(server).get())).toEqual(EMPTY)
  expect(ledgerCalls(http)).toEqual([])
})

test('impossible or malformed dates are dropped, never sent to BC', async () => {
  const { server, http } = fakeServer({ query: { from: '2026-02-30', to: "2026-01-01' or 1 eq 1" } })
  await load(server).get()
  expect(ledgerCalls(http)[0]).toContain(`$filter=${BASE} and Open eq true&`)
})

test('customer or company values in the request are ignored', async () => {
  const { server, http } = fakeServer({ query: { customerNo: 'C99', companyId: 'other' } })
  await load(server).get()
  expect(http.join(' ')).not.toMatch(/C99|other/)
})

test('an invalid page number falls back to page 1', async () => {
  const { server, http } = fakeServer({ query: { page: '-3' } })
  expect(JSON.parse(await load(server).get()).page).toBe(1)
  expect(ledgerCalls(http)[0]).toContain('$skip=0')
})

test('drops rows BC returns for another customer', async () => {
  const { server } = fakeServer({ entries: [ENTRY, { ...ENTRY, Document_No: 'SIN9', Customer_No: 'C1' }], count: 2 })
  expect(JSON.parse(await load(server).get()).entries.map((e: { docNo: string }) => e.docNo)).toEqual(['SIN0000000003'])
})

test('maps payments and credits: negative amounts, no due date, no PO, closed, BC type names with spaces', async () => {
  const payment = { ...ENTRY, Document_Type: 'Payment', Document_No: 'PMT-20441', External_Document_No: '', Due_Date: '0001-01-01', Amount: -320000, Remaining_Amount: 0, Open: false }
  const refund = { ...ENTRY, Document_Type: 'Finance_x0020_Charge_x0020_Memo', Document_No: 'FCM-1' }
  const { server } = fakeServer({ entries: [payment, refund], count: 2 })
  const [p, r] = JSON.parse(await load(server).get()).entries
  expect(p).toMatchObject({ type: 'Payment', refPo: null, dueDate: null, original: -320000, remaining: 0, status: 'Closed' })
  expect(r.type).toBe('Finance Charge Memo')
})

test('search: codes in upper case, description as typed, lower case and Capitalised; merged, de-duplicated, newest first', async () => {
  const older = { ...ENTRY, Entry_No: 900, Document_No: 'SIN0000000001', Posting_Date: '2026-08-01', Description: 'August cement delivery' }
  const { server, http } = fakeServer({
    query: { q: 'cement' },
    search: {
      "contains(Description,'cement')": [older, ENTRY],
      "contains(Description,'Cement')": [ENTRY],
    },
    entries: [],
  })
  const page = JSON.parse(await load(server).get())
  expect(page.entries.map((e: { docNo: string }) => e.docNo)).toEqual(['SIN0000000003', 'SIN0000000001'])
  expect(page.total).toBe(2)
  const calls = ledgerCalls(http)
  expect(calls).toHaveLength(4) // 'cement' is already lower case: as typed = lower
  for (const clause of ["contains(Document_No,'CEMENT')", "contains(External_Document_No,'CEMENT')", "contains(Description,'cement')", "contains(Description,'Cement')"]) {
    expect(calls.some((c) => c.includes(`$filter=${BASE} and Open eq true and ${clause}&`))).toBe(true)
  }
  for (const c of calls) {
    expect(c).toContain('$orderby=Posting_Date desc,Entry_No desc')
    expect(c).toContain('$top=200')
  }
})

test('search pages the merged results in the endpoint', async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ ...ENTRY, Entry_No: i, Document_No: `SIN${String(i).padStart(3, '0')}`, Posting_Date: `2026-09-${String(i + 1).padStart(2, '0')}` }))
  const { server } = fakeServer({ query: { q: 'SIN', page: '2' }, search: { "contains(Document_No,'SIN')": many }, entries: [] })
  const page = JSON.parse(await load(server).get())
  expect(page).toMatchObject({ total: 12, page: 2 })
  expect(page.entries.map((e: { docNo: string }) => e.docNo)).toEqual(['SIN001', 'SIN000'])
})

test('blank and quote-only searches: spaces mean no search, a quote is doubled', async () => {
  const blank = fakeServer({ query: { q: '   ' } })
  await load(blank.server).get()
  expect(ledgerCalls(blank.http)).toHaveLength(1)
  expect(ledgerCalls(blank.http)[0]).toContain('$count=true')
  const quote = fakeServer({ query: { q: "o'brien" }, entries: [] })
  await load(quote.server).get()
  expect(ledgerCalls(quote.http).some((c) => c.includes("contains(Document_No,'O''BRIEN')"))).toBe(true)
  expect(ledgerCalls(quote.http).some((c) => c.includes("contains(Description,'O''brien')"))).toBe(true)
})

test('BC down → only the customer-safe error', async () => {
  const { server } = fakeServer({ bcDown: true })
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

test('only Full Access and Finance & Documents can call it', () => {
  const yml = readFileSync(resolve('.powerpages-site/server-logic/ledger/ledger.serverlogic.yml'), 'utf8')
  expect(yml).toContain('name: ledger')
  // Trimmed lines, so a CRLF checkout reads the same.
  expect(yml.split('\n').map((line) => line.trim()).filter((line) => /^- [0-9a-f-]{36}$/.test(line))).toEqual([
    '- 56b29291-b981-4ef0-865b-41c1e9523a97',
    '- c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3',
  ])
})

// Final review 2026-10-13: one payment can post several entries with the same type, number and date (one per settled
// invoice). They must all show, and BC's entry number keeps paging stable when such entries tie.
test('search keeps separate BC entries that share a document number and date', async () => {
  const line = (Entry_No: number) => ({ ...ENTRY, Document_Type: 'Payment', Document_No: 'PMT-1', Entry_No, Amount: -100 })
  const { server, http } = fakeServer({ query: { q: 'PMT-1' }, search: { "contains(Document_No,'PMT-1')": [line(7), line(9), line(8)] }, entries: [] })
  const page = JSON.parse(await load(server).get())
  expect(page.total).toBe(3)
  expect(ledgerCalls(http)[0]).toContain('$select=Customer_No,Entry_No,')
})
