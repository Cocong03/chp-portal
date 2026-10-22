import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/dashboard/dashboard.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)
const RULES: Record<string, string> = new Function(
  'Server',
  `${readFileSync(resolve('server-logic-src/bc-helpers.js'), 'utf8')}\nreturn ORDER_STATUS_FILTER`,
)({})

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'client-1', 'BC/ClientSecret': 'secret-1',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })
const COUNTS: Record<string, number> = { Open: 7, 'Pending Prepayment': 1, 'Ready for Dispatch': 2, 'Completely Shipped': 0 }

function fakeServer({
  query = {} as Record<string, string>,
  credit = [{ customerNo: 'C00000002', outstandingBalance: 174000, balanceDueToday: 24750, overdueAmount: 24750, creditLimit: 500000, currentExposure: 203220, availableCredit: 296780 }] as unknown[],
  bcDown = false,
  creditDown = false,
  noCount = false,
  // Archived orders; SOR3 is partly posted and still live, so it isn't Invoiced.
  archive = [{ salesOrderNo: 'SOR2', sellToCustomerNo: 'C00000002', documentType: 'Order', orderDate: '2026-09-01' },
    { salesOrderNo: 'SOR3', sellToCustomerNo: 'C00000002', documentType: 'Order', orderDate: '2026-09-02' }] as unknown[],
} = {}) {
  const http: string[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: { ServerLogicName: 'dashboard', QueryParameters: query, Body: '' },
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
          if (plain.includes('/mcrmCustCreditOverviews')) {
            return creditDown ? JSON.stringify({ StatusCode: 400, IsSuccessStatusCode: false, ReasonPhrase: 'Bad Request', Body: '' }) : ok({ value: credit })
          }
          if (plain.includes('/mcrmSalesOrderArchives')) return ok({ value: archive })
          if (plain.includes('$select=salesOrderNo&$top=1000')) return ok({ value: [{ salesOrderNo: 'SOR1' }, { salesOrderNo: 'SOR3' }] })
          if (noCount) return ok({ value: [] })
          const status = Object.keys(RULES).find((s) => plain.includes(RULES[s]))!
          return ok({ value: [{ salesOrderNo: 'SOR1' }], '@odata.count': COUNTS[status] })
        },
      },
    },
  }
  return { server, http }
}

const orderCalls = (http: string[]) => http.filter((u) => u.includes('/mcrmSalesOrders?') && !u.includes('$top=1000'))

test('counts each status with exactly the Orders filter rule, and reads the credit overview', async () => {
  const { server, http } = fakeServer()
  expect(JSON.parse(await load(server).get())).toEqual({
    counts: { open: 7, pendingPrepayment: 1, readyForDispatch: 2, completelyShipped: 0, invoiced: 1 },
    account: { balance: 174000, balanceDue: 24750, overdue: 24750, creditLimit: 500000, availableCredit: 296780 },
  })
  const calls = orderCalls(http)
  expect(calls).toHaveLength(4)
  for (const rule of Object.values(RULES)) {
    const call = calls.find((c) => c.includes(rule))!
    expect(call).toContain(`$filter=sellToCustomerNo eq 'C00000002' and documentType eq 'Order' and ${rule}&`)
    expect(call).toContain('$top=1')
    expect(call).toContain('$count=true')
  }
  expect(http.some((u) => u.includes("/mcrmCustCreditOverviews?$filter=customerNo eq 'C00000002'"))).toBe(true)
})

test("no credit overview row, or another customer's row, gives no figures", async () => {
  for (const credit of [[], [{ customerNo: 'C99', outstandingBalance: 1, balanceDueToday: 1, overdueAmount: 1, creditLimit: 1, availableCredit: 1 }]]) {
    const { server } = fakeServer({ credit })
    expect(JSON.parse(await load(server).get()).account).toEqual({ balance: null, balanceDue: null, overdue: null, creditLimit: null, availableCredit: null })
  }
})

test('customer or company values in the request are ignored', async () => {
  const { server, http } = fakeServer({ query: { customerNo: 'C99', companyId: 'other' } })
  await load(server).get()
  expect(http.join(' ')).not.toMatch(/C99|other/)
})

test('BC down → only the customer-safe error', async () => {
  const { server } = fakeServer({ bcDown: true })
  await expect(load(server).get()).rejects.toThrow("We couldn't load this information. Please try again.")
})

test('every business role can call it', () => {
  const yml = readFileSync(resolve('.powerpages-site/server-logic/dashboard/dashboard.serverlogic.yml'), 'utf8')
  expect(yml).toContain('name: dashboard')
  // Trimmed lines, so a CRLF checkout reads the same.
  expect(yml.split('\n').map((line) => line.trim()).filter((line) => /^- [0-9a-f-]{36}$/.test(line))).toEqual([
    '- 56b29291-b981-4ef0-865b-41c1e9523a97',
    '- 11bb7218-55fb-4cae-b8a1-5af2f41237c5',
    '- c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3',
    '- 0c42c9f3-bc20-40a2-8c6a-a731a263ed83',
  ])
})

// Final review 2026-10-15: a confident 0 when BC sends no count would mislead; "—" is honest.
test('a count BC does not return is null, never a made-up 0', async () => {
  const { server } = fakeServer({ noCount: true })
  expect(JSON.parse(await load(server).get()).counts).toEqual({
    open: null, pendingPrepayment: null, readyForDispatch: null, completelyShipped: null, invoiced: 1,
  })
})

// A failing credit overview must not take down the live counts: its tiles show "—".
test('a failing credit overview read leaves the counts and gives no figures', async () => {
  const { server } = fakeServer({ creditDown: true })
  const dto = JSON.parse(await load(server).get())
  expect(dto.counts.open).toBe(7)
  expect(dto.account).toEqual({ balance: null, balanceDue: null, overdue: null, creditLimit: null, availableCredit: null })
})

// Invoiced = archived and no longer live (probed 2026-10-16), the same rule as the Orders Invoiced filter.
test('Invoiced counts archived orders that are no longer live, for the session customer only', async () => {
  const { server, http } = fakeServer({ archive: [
    { salesOrderNo: 'SOR2', sellToCustomerNo: 'C00000002', documentType: 'Order', orderDate: '2026-09-01' },
    { salesOrderNo: 'SOR4', sellToCustomerNo: 'C00000002', documentType: 'Order', orderDate: '2026-09-03' },
    { salesOrderNo: 'SOR9', sellToCustomerNo: 'C1', documentType: 'Order', orderDate: '2026-09-03' },
  ] })
  expect(JSON.parse(await load(server).get()).counts.invoiced).toBe(2)
  expect(http.some((u) => u.includes("/mcrmSalesOrderArchives?$filter=sellToCustomerNo eq 'C00000002' and documentType eq 'Order'&"))).toBe(true)
})
