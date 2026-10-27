import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Endpoint = Record<'get' | 'post', () => Promise<string>>
const source = readFileSync(resolve('.powerpages-site/server-logic/requests/requests.js'), 'utf8')
const load = (server: unknown): Endpoint => new Function('Server', `${source}\nreturn { get, post }`)(server)

const CONTACT = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })
const SETTINGS: Record<string, string> = {
  'BC/TenantId': 't', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'c', 'BC/ClientSecret': 's',
}
const type = (category: string, name: string, config: unknown, active = true) => ({
  chp_name: name, chp_category: category, chp_assignedgroup: 'Service Center', chp_active: active, chp_fieldconfig: JSON.stringify(config),
})
const TYPES = [
  type('Sales Order', 'Modification', { rows: ['order'], orderLabel: 'Sales Order Number' }),
  type('Sales Order', 'Cancellation', { rows: ['order'], orderLabel: 'Sales Order Number' }, false),
  type('Sales Order', 'Query', { rows: ['order'], orderLabel: 'Related order (optional)', optional: ['order'] }),
  type('Delivery', 'Concern', { rows: ['trip', 'order', 'site'], orderLabel: 'Related Sales Order', optional: ['trip'] }),
  type('Document Copy', 'Delivery Receipt (DR)', { rows: ['docref', 'docdate'] }),
  type('Account', 'User Access', { rows: ['userEmail'] }),
]
const ROW = {
  chp_requestid: REQUEST_ID, chp_reference: 'RQ-00001', createdon: '2026-10-27T01:00:00Z', chp_category: 'Sales Order', chp_requesttype: 'Modification',
  chp_assignedgroup: 'Service Center', chp_contactmethod: 775000001, chp_contactvalue: '0917 552 6613', chp_contactperson: 'Buyer Name', chp_details: 'Move it',
  chp_additionalinfo: '', chp_attachmentname: 'a.pdf', chp_status: 775000001,
  chp_fields: JSON.stringify([{ key: 'order', label: 'Sales Order Number', value: 'SO-100467' }]),
}

/** A signed-in contact with portal access on; `portal` is the MCRMContacts answer (empty = blocked). */
function fakeServer({ query = {}, body = '', portal = [{ companyNo: 'CT1', name: 'Buyer' }], rows = [ROW], bcCustomer = 'C00000002', orderCustomer = bcCustomer }: { query?: Record<string, string>; body?: string; portal?: unknown[]; rows?: unknown[]; bcCustomer?: string; orderCustomer?: string } = {}) {
  const calls: { op: string; args: unknown[] }[] = []
  const server = {
    User: { contactid: CONTACT },
    SiteSetting: { Get: (name: string) => SETTINGS[name] },
    Context: { ServerLogicName: 'requests', QueryParameters: query, Body: body },
    Logger: { Log() {}, Warn() {}, Error() {} },
    Connector: {
      Dataverse: {
        RetrieveRecord: (...args: unknown[]) => {
          if (args[0] === 'contacts' && String(args[2]).includes('fullname')) {
            calls.push({ op: 'RetrieveRecord', args })
            return JSON.stringify({ fullname: 'Buyer Name' })
          }
          if (args[0] === 'contacts') {
            return { contactid: CONTACT, emailaddress1: 'buyer@808.ph', parentcustomerid_account: { accountid: ACCOUNT, chp_bccustomerno: 'C00000002', chp_bccompanyid: 'co-1' } }
          }
          throw new Error(`unexpected RetrieveRecord ${String(args[0])}`)
        },
        RetrieveMultipleRecords: (...args: unknown[]) => {
          calls.push({ op: 'RetrieveMultipleRecords', args })
          const options = String(args[1])
          if (args[0] === 'chp_requests') return JSON.stringify({ value: options.includes('chp_requestid,chp_reference') ? rows.slice(0, 1) : rows })
          const category = /chp_category eq '([^']*)'/.exec(options)?.[1]
          const name = /chp_name eq '([^']*)'/.exec(options)?.[1]
          const active = TYPES.filter((t) => t.chp_active)
          return JSON.stringify({ value: category ? active.filter((t) => t.chp_category === category && t.chp_name === name) : active })
        },
        CreateRecord: (...args: unknown[]) => calls.push({ op: 'CreateRecord', args }) && '',
      },
      HttpClient: {
        PostAsync: async () => ok({ access_token: 'tok' }),
        GetAsync: async (url: string) => {
          const u = decodeURIComponent(url)
          if (u.includes('/MCRMContacts')) return ok({ value: portal })
          if (u.includes('/mcrmBusinessRelation')) return ok({ value: [{ vendorNo: 'C00000002' }] })
          // BC answers only when the filter names the session customer; bcCustomer lets a test make BC ignore the filter.
          if (/\/mcrmSalesOrders(Archives)?\?/.test(u) && u.includes("sellToCustomerNo eq 'C00000002'") && u.includes("salesOrderNo eq 'SO-100467'")) return ok({ value: [{ salesOrderNo: 'SO-100467', sellToCustomerNo: orderCustomer, documentType: 'Order' }] })
          if (u.includes('/mcrmShipToAddress') && u.includes("documentNo eq 'C00000002'") && u.includes("code eq 'PLANT1'")) return ok({ value: [{ documentNo: bcCustomer, code: 'PLANT1', name: 'Plant 1 — Main Yard' }] })
          return ok({ value: [] })
        },
      },
    },
  }
  return { server, calls, writes: () => calls.filter((c) => c.op === 'CreateRecord') }
}
const answer = async (result: Promise<string>) => JSON.parse(await result)
const BODY = { category: 'Sales Order', requestType: 'Modification', contactMethod: 'Email', contactValue: 'jd@808.ph', details: 'Please move it', additionalInfo: '', fields: { order: 'SO-100467' } }
const submit = (body: unknown) => fakeServer({ body: JSON.stringify(body) })
const created = (calls: { op: string; args: unknown[] }[], table = 'chp_requests') => JSON.parse(calls.find((c) => c.op === 'CreateRecord' && c.args[0] === table)!.args[1] as string)
const PDF = { name: 'po.pdf', base64: 'aGVsbG8=' }

test("GET lists the session account's rows, newest first, through the Power Pages cache bypass", async () => {
  const { server, calls } = fakeServer()
  await load(server).get()
  const read = calls.find((c) => c.args[0] === 'chp_requests')!
  expect(String(read.args[1])).toContain(`_chp_account_value eq ${ACCOUNT}`)
  expect(String(read.args[1])).toContain('$orderby=createdon desc')
  expect(read.args.at(-1)).toBe(true)
})

test('GET maps a row to RequestDto with status label and extra from chp_fields', async () => {
  const [dto] = await answer(load(fakeServer().server).get())
  expect(dto).toMatchObject({
    id: REQUEST_ID, ref: 'RQ-00001', submitted: '2026-10-27T01:00:00Z', contactMethod: 'Mobile', attachmentName: 'a.pdf', status: 'In Review',
    extra: [{ label: 'Sales Order Number', value: 'SO-100467' }],
  })
})

test('GET answers Submitted for an unknown status and no extra for broken chp_fields', async () => {
  const [dto] = await answer(load(fakeServer({ rows: [{ ...ROW, chp_status: 1, chp_fields: '{nope' }] }).server).get())
  expect(dto).toMatchObject({ status: 'Submitted', extra: [] })
})

test('GET ?taxonomy=1 returns active categories with their field config', async () => {
  const { server, calls } = fakeServer({ query: { taxonomy: '1' } })
  const result = await answer(load(server).get())
  expect(String(calls[0].args[1])).toContain('chp_active eq true')
  expect(calls[0].args.at(-1)).toBe(true)
  expect(result.categories.map((c: { name: string }) => c.name)).toEqual(['Sales Order', 'Delivery', 'Document Copy', 'Account'])
  expect(result.categories[0]).toEqual({
    name: 'Sales Order', fields: { rows: ['order'], orderLabel: 'Sales Order Number' },
    types: [{ type: 'Modification', group: 'Service Center' }, { type: 'Query', group: 'Service Center' }],
  })
})

test('GET as a blocked contact answers blocked', async () => {
  expect(await answer(load(fakeServer({ portal: [] }).server).get())).toEqual({ blocked: true })
})

test('POST sets account, contact, contact person, group and status from the server, never from the body', async () => {
  const { server, calls } = submit({ ...BODY, account: 'evil', assignedGroup: 'Hackers', status: 'Resolved', contactPerson: 'Evil' })
  expect(await answer(load(server).post())).toEqual({ ref: 'RQ-00001' })
  expect(created(calls)).toMatchObject({
    'chp_Account@odata.bind': `/accounts(${ACCOUNT})`, 'chp_Contact@odata.bind': `/contacts(${CONTACT})`,
    chp_contactperson: 'Buyer Name', chp_assignedgroup: 'Service Center', chp_status: 775000000, chp_syncstate: 775000000, chp_syncattempts: 0,
    chp_contactmethod: 775000000, chp_requesttype: 'Modification',
    chp_fields: JSON.stringify([{ key: 'order', label: 'Sales Order Number', value: 'SO-100467' }]),
  })
})

const big = 'A'.repeat(6_990_508) // decodes to 5,242,881 bytes
test.each([
  ['an unknown type', { requestType: 'Nope' }, 'requestType'],
  ['an inactive type', { requestType: 'Cancellation' }, 'requestType'],
  ['a type from another category', { category: 'Delivery' }, 'requestType'],
  ['contact method Fax', { contactMethod: 'Fax' }, 'contactMethod'],
  ['a bad email', { contactValue: 'not-an-email' }, 'contactValue'],
  ['a bad mobile', { contactMethod: 'Mobile', contactValue: '12345' }, 'contactValue'],
  ['empty details', { details: '   ' }, 'details'],
  ['4001-character details', { details: 'x'.repeat(4001) }, 'details'],
  ['an unknown field key', { fields: { order: 'SO-100467', qty: '5' } }, 'qty'],
  ['a missing required order', { fields: {} }, 'order'],
  ["another customer's SO", { fields: { order: 'SO-999999' } }, 'order'],
  ['an unknown site', { category: 'Delivery', requestType: 'Concern', fields: { order: 'SO-100467', site: 'NOPE' } }, 'site'],
  ['a bad document date', { category: 'Document Copy', requestType: 'Delivery Receipt (DR)', fields: { docref: 'DR-1', docdate: '2026-02-30' } }, 'docdate'],
  ['a bad affected user email', { category: 'Account', requestType: 'User Access', fields: { userEmail: 'nope' } }, 'userEmail'],
  ['a 51-character trip', { category: 'Delivery', requestType: 'Concern', fields: { trip: 'T'.repeat(51), order: 'SO-100467', site: 'PLANT1' } }, 'trip'],
  ['contact method toString', { contactMethod: 'toString' }, 'contactMethod'],
  ['an attachment named evil.constructor', { attachment: { name: 'evil.constructor', base64: 'aGVsbG8=' } }, 'attachment'],
  ['an attachment named x.__proto__', { attachment: { name: 'x.__proto__', base64: 'aGVsbG8=' } }, 'attachment'],
  ['unpadded base64', { attachment: { name: 'x.pdf', base64: 'aGVsbG8' } }, 'attachment'],
  ['a .exe attachment', { attachment: { name: 'x.exe', base64: 'aGVsbG8=' } }, 'attachment'],
  ['a 5,242,881-byte attachment', { attachment: { name: 'x.pdf', base64: big } }, 'attachment'],
])('POST with %s is invalid, nothing written', async (_case, change, field) => {
  const { server, writes } = submit({ ...BODY, ...change })
  expect(await answer(load(server).post())).toEqual({ invalid: true, field })
  expect(writes()).toEqual([])
})

test('POST accepts an attachment at the size limit and an optional field left empty', async () => {
  const exact = 'A'.repeat(6_990_506) + '==' // 6,990,508 chars, 2 padding: 5,242,879 bytes
  const { server, writes } = submit({ ...BODY, requestType: 'Query', fields: {}, attachment: { name: 'x.pdf', base64: exact } })
  expect(await answer(load(server).post())).toEqual({ ref: 'RQ-00001' })
  expect(writes()).toHaveLength(1) // the note rides in the same create
})

test('POST stores the site as "<code> — <name>" from BC, not the label the client sent', async () => {
  const { server, calls } = submit({ ...BODY, category: 'Delivery', requestType: 'Concern', fields: { order: 'SO-100467', site: 'PLANT1' }, siteLabel: 'Evil' })
  expect(await answer(load(server).post())).toEqual({ ref: 'RQ-00001' })
  expect(JSON.parse(created(calls).chp_fields)).toEqual([
    { key: 'order', label: 'Related Sales Order', value: 'SO-100467' },
    { key: 'site', label: 'Delivery site (Ship-to Address)', value: 'PLANT1 — Plant 1 — Main Yard' },
  ])
})

test('POST with a file deep-inserts one note in the same create, no separate annotations create', async () => {
  const { server, calls, writes } = submit({ ...BODY, attachment: PDF })
  await load(server).post()
  expect(writes().map((c) => c.args[0])).toEqual(['chp_requests'])
  expect(created(calls).chp_attachmentname).toBe('po.pdf')
  expect(created(calls).chp_request_Annotations).toEqual([{ subject: 'po.pdf', filename: 'po.pdf', mimetype: 'application/pdf', documentbody: 'aGVsbG8=' }])
})

test('POST answers an empty ref, not an error, when the new row cannot be read back', async () => {
  const { server, writes } = fakeServer({ body: JSON.stringify(BODY), rows: [] })
  expect(await answer(load(server).post())).toEqual({ ref: '' })
  expect(writes()).toHaveLength(1)
})

test.each([
  ["another customer's order", { fields: { order: 'SO-100467' } }, 'order'],
  ["another customer's ship-to", { category: 'Delivery', requestType: 'Concern', fields: { order: 'SO-100467', site: 'PLANT1' } }, 'site'],
])('POST rejects %s even when BC ignores the filter', async (_case, change, field) => {
  const { server, writes } = fakeServer({ body: JSON.stringify({ ...BODY, ...change }), bcCustomer: 'C99999999', orderCustomer: field === 'site' ? 'C00000002' : undefined })
  expect(await answer(load(server).post())).toEqual({ invalid: true, field })
  expect(writes()).toEqual([])
})

test('POST escapes a quote in the type before it reaches the filter', async () => {
  const { server, calls } = submit({ ...BODY, requestType: "O'Brien" })
  await load(server).post()
  expect(String(calls.find((c) => c.args[0] === 'chp_requesttypes')!.args[1])).toContain("chp_name eq 'O''Brien'")
})

test('POST as a blocked contact answers blocked and writes nothing', async () => {
  const { server, writes } = fakeServer({ body: JSON.stringify(BODY), portal: [] })
  expect(await answer(load(server).post())).toEqual({ blocked: true })
  expect(writes()).toEqual([])
})

// Reads right after writes must not come from the Power Pages data cache (seen stale for 15 minutes elsewhere).
test('every request read skips the Power Pages cache', async () => {
  const runs = [fakeServer(), fakeServer({ query: { taxonomy: '1' } }), submit({ ...BODY, attachment: PDF })]
  await load(runs[0].server).get()
  await load(runs[1].server).get()
  await load(runs[2].server).post()
  for (const { calls } of runs) {
    for (const call of calls.filter((c) => c.op.startsWith('Retrieve'))) expect(call.args.at(-1), `${call.op} ${String(call.args[1])}`).toBe(true)
  }
})
