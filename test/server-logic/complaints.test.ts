import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Endpoint = Record<'get' | 'post' | 'put', () => Promise<string>>
const source = readFileSync(resolve('.powerpages-site/server-logic/complaints/complaints.js'), 'utf8')
const load = (server: unknown): Endpoint => new Function('Server', `${source}\nreturn { get, post, put }`)(server)

const CONTACT = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const COMPLAINT_ID = '33333333-3333-4333-8333-333333333333'
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })
const SETTINGS: Record<string, string> = {
  'BC/TenantId': 't', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'c', 'BC/ClientSecret': 's',
}
const type = (category: string, name: string, group: string, active = true) => ({ chp_name: name, chp_category: category, chp_assignedgroup: group, chp_active: active })
const TYPES = [
  type('Billing & Documentation', 'Incorrect Invoice', 'Finance'),
  type('Delivery & Handling', 'Delivery Delay', 'Logistics'),
  type('Delivery & Handling', 'Retired Concern', 'Logistics', false),
  type('Delivery & Handling', 'Customer Service Concern', 'Service Center'),
  type('Product Quality', "O'Brien", 'Technical Services'),
]
const ROW = {
  chp_complaintid: COMPLAINT_ID, chp_reference: 'CMP-00001', createdon: '2026-10-27T01:00:00Z', chp_category: 'Delivery & Handling', chp_complainttype: 'Delivery Delay',
  chp_assignedgroup: 'Logistics', chp_incidentdate: '2026-10-20', chp_sitelabel: 'PLANT1 — Plant 1 — Main Yard', chp_subject: 'Late truck', chp_description: 'Two days late',
  chp_relatedorder: 'SO-100467', chp_contactmethod: 775000001, chp_contactvalue: '0917 552 6613', chp_contactperson: 'Buyer Name', chp_attachmentname: 'a.pdf',
  chp_status: 775000002, chp_dateresolved: '2026-10-25', chp_resolution: 'Credit issued',
}

/** A signed-in contact with portal access on; `portal` is the MCRMContacts answer (empty = blocked). */
function fakeServer({ query = {}, body = '', portal = [{ companyNo: 'CT1', name: 'Buyer' }], rows = [ROW], notes = [], bcCustomer = 'C00000002', orderCustomer = bcCustomer }: { query?: Record<string, string>; body?: string; portal?: unknown[]; rows?: unknown[]; notes?: unknown[]; bcCustomer?: string; orderCustomer?: string } = {}) {
  const calls: { op: string; args: unknown[] }[] = []
  const warnings: string[] = []
  const server = {
    User: { contactid: CONTACT },
    SiteSetting: { Get: (name: string) => SETTINGS[name] },
    Context: { ServerLogicName: 'complaints', QueryParameters: query, Body: body },
    Logger: { Log() {}, Warn: (m: string) => warnings.push(m), Error() {} },
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
          const options = decodeURIComponent(String(args[1]))
          if (args[0] === 'chp_complaints') return JSON.stringify({ value: options.includes('chp_complaintid,chp_reference') ? rows.slice(0, 1) : rows })
          if (args[0] === 'annotations') return JSON.stringify({ value: notes })
          const unescape = (s?: string) => s?.split("''").join("'")
          const category = unescape(/chp_category eq '((?:[^']|'')*)'/.exec(options)?.[1])
          const name = unescape(/chp_name eq '((?:[^']|'')*)'/.exec(options)?.[1])
          const active = TYPES.filter((t) => t.chp_active)
          return JSON.stringify({ value: category ? active.filter((t) => t.chp_category.toLowerCase() === category.toLowerCase() && t.chp_name === name) : active })
        },
        CreateRecord: (...args: unknown[]) => calls.push({ op: 'CreateRecord', args }) && '',
        UpdateRecord: (...args: unknown[]) => calls.push({ op: 'UpdateRecord', args }) && '',
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
  return { server, calls, warnings, writes: () => calls.filter((c) => c.op === 'CreateRecord' || c.op === 'UpdateRecord') }
}
const answer = async (result: Promise<string>) => JSON.parse(await result)
const BODY = {
  category: 'Billing & Documentation', complaintType: 'Incorrect Invoice', contactMethod: 'Email', contactValue: 'jd@808.ph', incidentDate: '', site: '', relatedOrder: '',
  subject: 'Wrong amount', description: 'The invoice total is off', consent: true,
}
const DELIVERY = { category: 'Delivery & Handling', complaintType: 'Delivery Delay' }
const submit = (body: unknown) => fakeServer({ body: JSON.stringify(body) })
const created = (calls: { op: string; args: unknown[] }[], table = 'chp_complaints') => JSON.parse(calls.find((c) => c.op === 'CreateRecord' && c.args[0] === table)!.args[1] as string)
const manilaDay = (offsetDays: number) => new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10)

test("GET lists the session account's rows, newest first, through the Power Pages cache bypass", async () => {
  const { server, calls } = fakeServer()
  await load(server).get()
  const read = calls.find((c) => c.args[0] === 'chp_complaints')!
  expect(String(read.args[1])).toContain(`_chp_account_value eq ${ACCOUNT}`)
  expect(String(read.args[1])).toContain('$orderby=createdon desc')
  expect(read.args.at(-1)).toBe(true)
})

test('GET maps a row to ComplaintDto', async () => {
  const [dto] = await answer(load(fakeServer().server).get())
  expect(dto).toEqual({
    id: COMPLAINT_ID, ref: 'CMP-00001', submitted: '2026-10-27T01:00:00Z', category: 'Delivery & Handling', complaintType: 'Delivery Delay', assignedGroup: 'Logistics',
    incidentDate: '2026-10-20', deliverySite: 'PLANT1 — Plant 1 — Main Yard', subject: 'Late truck', description: 'Two days late', relatedOrder: 'SO-100467',
    contactMethod: 'Mobile', contactValue: '0917 552 6613', contactPerson: 'Buyer Name', attachmentName: 'a.pdf', status: 'Resolved', dateResolved: '2026-10-25', resolutionNote: 'Credit issued',
  })
})

test('GET answers empty dates, Submitted and Email for missing or unknown values', async () => {
  const [dto] = await answer(load(fakeServer({ rows: [{ chp_complaintid: COMPLAINT_ID, chp_status: 1, chp_contactmethod: 9 }] }).server).get())
  expect(dto).toMatchObject({ status: 'Submitted', contactMethod: 'Email', incidentDate: '', dateResolved: '', resolutionNote: '', deliverySite: '' })
})

test('GET ?taxonomy=1 returns active categories and types, no field config', async () => {
  const { server, calls } = fakeServer({ query: { taxonomy: '1' } })
  const result = await answer(load(server).get())
  expect(String(calls[0].args[0])).toBe('chp_complainttypes')
  expect(String(calls[0].args[1])).toContain('chp_active eq true')
  expect(calls[0].args.at(-1)).toBe(true)
  expect(result.categories.map((c: { name: string }) => c.name)).toEqual(['Billing & Documentation', 'Delivery & Handling', 'Product Quality'])
  expect(result.categories[1]).toEqual({ name: 'Delivery & Handling', types: [{ type: 'Delivery Delay', group: 'Logistics' }, { type: 'Customer Service Concern', group: 'Service Center' }] })
})

test('GET as a blocked contact answers blocked', async () => {
  expect(await answer(load(fakeServer({ portal: [] }).server).get())).toEqual({ blocked: true })
})

test("POST stores the taxonomy row's category, not the casing the client sent", async () => {
  const { server, calls } = submit({ ...BODY, category: 'billing & documentation' })
  expect(await answer(load(server).post())).toEqual({ ref: 'CMP-00001', id: COMPLAINT_ID })
  expect(created(calls)).toMatchObject({ chp_category: 'Billing & Documentation', chp_complainttype: 'Incorrect Invoice' })
})

test('POST sets account, contact, person, group, status, consent and sync from the server, never from the body', async () => {
  const { server, calls } = submit({ ...BODY, account: 'evil', assignedGroup: 'Hackers', status: 'Resolved', contactPerson: 'Evil', resolution: 'x' })
  expect(await answer(load(server).post())).toEqual({ ref: 'CMP-00001', id: COMPLAINT_ID })
  expect(created(calls)).toMatchObject({
    'chp_Account@odata.bind': `/accounts(${ACCOUNT})`, 'chp_Contact@odata.bind': `/contacts(${CONTACT})`,
    chp_contactperson: 'Buyer Name', chp_assignedgroup: 'Finance', chp_status: 775000000, chp_syncstate: 775000000, chp_syncattempts: 0,
    chp_contactmethod: 775000000, chp_complainttype: 'Incorrect Invoice', chp_subject: 'Wrong amount', chp_consent: true,
  })
  expect(created(calls)).not.toHaveProperty('chp_resolution')
})

test.each([
  ['an unknown type', { complaintType: 'Nope' }, 'complaintType'],
  ['an inactive type', { ...DELIVERY, complaintType: 'Retired Concern' }, 'complaintType'],
  ['a type from another category', { category: 'Product Quality' }, 'complaintType'],
  ['no category', { category: '' }, 'category'],
  ['contact method Fax', { contactMethod: 'Fax' }, 'contactMethod'],
  ['contact method toString', { contactMethod: 'toString' }, 'contactMethod'],
  ['a bad email', { contactValue: 'not-an-email' }, 'contactValue'],
  ['a bad mobile', { contactMethod: 'Mobile', contactValue: '12345' }, 'contactValue'],
  ['a missing subject', { subject: '  ' }, 'subject'],
  ['a 201-character subject', { subject: 'x'.repeat(201) }, 'subject'],
  ['a 4001-character description', { description: 'x'.repeat(4001) }, 'description'],
  ['consent false', { consent: false }, 'consent'],
  ['consent the string "true"', { consent: 'true' }, 'consent'],
  ['no consent', { consent: undefined }, 'consent'],
  ['a site with category Billing & Documentation', { site: 'PLANT1' }, 'site'],
  ['an unknown site', { ...DELIVERY, site: 'NOPE' }, 'site'],
  ['an incident date tomorrow', { incidentDate: manilaDay(1) }, 'incidentDate'],
  ['an impossible incident date', { incidentDate: '2026-02-30' }, 'incidentDate'],
  ['a malformed incident date', { incidentDate: '10/20/2026' }, 'incidentDate'],
  ["another customer's related order", { relatedOrder: 'SO-999999' }, 'relatedOrder'],
  ['a .xlsx attachment', { attachmentName: 'x.xlsx' }, 'attachment'],
  ['a .xls attachment', { attachmentName: 'x.xls' }, 'attachment'],
  ['a .exe attachment', { attachmentName: 'x.exe' }, 'attachment'],
  ['an attachment name that is not text', { attachmentName: 5 }, 'attachment'],
  ['an attachment named evil.constructor', { attachmentName: 'evil.constructor' }, 'attachment'],
  ['an attachment named x.__proto__', { attachmentName: 'x.__proto__' }, 'attachment'],
  ['an attachment named x.toString', { attachmentName: 'x.toString' }, 'attachment'],
  ['an attachment name with a line break', { attachmentName: 'a\r\nb.pdf' }, 'attachment'],
  ['an attachment name with a quote', { attachmentName: 'a"b.pdf' }, 'attachment'],
  ['an attachment name with a path', { attachmentName: '..\\x.pdf' }, 'attachment'],
])('POST with %s is invalid, nothing written', async (_case, change, field) => {
  const { server, writes } = submit({ ...BODY, ...change })
  expect(await answer(load(server).post())).toEqual({ invalid: true, field })
  expect(writes()).toEqual([])
})

test('POST accepts today (Manila) and an empty optional set', async () => {
  const { server, writes } = submit({ ...BODY, incidentDate: manilaDay(0) })
  expect(await answer(load(server).post())).toEqual({ ref: 'CMP-00001', id: COMPLAINT_ID })
  expect(writes()).toHaveLength(1)
})

test('POST stores the site code and "<code> — <name>" from BC, and the owned order, for Delivery & Handling', async () => {
  const { server, calls } = submit({ ...BODY, ...DELIVERY, site: 'PLANT1', relatedOrder: 'SO-100467', incidentDate: '2026-10-20', siteLabel: 'Evil' })
  expect(await answer(load(server).post())).toEqual({ ref: 'CMP-00001', id: COMPLAINT_ID })
  expect(created(calls)).toMatchObject({ chp_sitecode: 'PLANT1', chp_sitelabel: 'PLANT1 — Plant 1 — Main Yard', chp_relatedorder: 'SO-100467', chp_incidentdate: '2026-10-20', chp_assignedgroup: 'Logistics' })
})

// The file goes straight to Dataverse through the Web API once the row exists (a ~2 MB Server Logic body fails on Power
// Pages). Until PUT has checked the note, the row has no sync state, so the send flow leaves it alone.
test('POST with a file to follow saves the row with no sync state, no attachment name and no note', async () => {
  const { server, calls, writes } = submit({ ...BODY, attachmentName: 'po.pdf' })
  expect(await answer(load(server).post())).toEqual({ ref: 'CMP-00001', id: COMPLAINT_ID })
  expect(writes().map((c) => c.args[0])).toEqual(['chp_complaints'])
  const row = created(calls)
  expect(row.chp_syncstate).toBeNull()
  expect(row).not.toHaveProperty('chp_attachmentname')
  expect(row).not.toHaveProperty('chp_complaint_Annotations')
})

test('POST without a file saves the row Pending, so the send flow picks it up at once', async () => {
  const { server, calls } = submit(BODY)
  await load(server).post()
  expect(created(calls).chp_syncstate).toBe(775000000)
})

test('POST answers an empty ref and logs a warning when the new row cannot be read back', async () => {
  const { server, writes, warnings } = fakeServer({ body: JSON.stringify(BODY), rows: [] })
  expect(await answer(load(server).post())).toEqual({ ref: '', id: '' })
  expect(writes()).toHaveLength(1)
  expect(warnings.some((m) => m.includes('read it back'))).toBe(true)
})

test.each([
  ["another customer's order", { relatedOrder: 'SO-100467' }, 'relatedOrder'],
  ["another customer's ship-to", { ...DELIVERY, site: 'PLANT1' }, 'site'],
])('POST rejects %s even when BC ignores the filter', async (_case, change, field) => {
  const { server, writes } = fakeServer({ body: JSON.stringify({ ...BODY, ...change }), bcCustomer: 'C99999999', orderCustomer: field === 'site' ? 'C00000002' : 'C99999999' })
  expect(await answer(load(server).post())).toEqual({ invalid: true, field })
  expect(writes()).toEqual([])
})

test('POST escapes a quote in the type before it reaches the filter', async () => {
  const { server, calls } = submit({ ...BODY, category: 'Product Quality', complaintType: "O'Brien" })
  await load(server).post()
  expect(decodeURIComponent(String(calls.find((c) => c.args[0] === 'chp_complainttypes')!.args[1]))).toContain("chp_name eq 'O''Brien'")
})

// An unencoded "&" ends the $filter early and Dataverse rejects the query (seen on Dev with "Billing & Documentation").
test('POST URL-encodes the taxonomy filter so a name with "&" stays inside it', async () => {
  const { server, calls } = submit({ ...BODY, category: 'Billing & Documentation', complaintType: 'Incorrect Invoice' })
  await load(server).post()
  const query = String(calls.find((c) => c.args[0] === 'chp_complainttypes')!.args[1])
  expect(query.split('&').filter((part) => part.startsWith('$filter='))).toHaveLength(1)
  expect(query).not.toMatch(/ & /)
})

test('POST as a blocked contact answers blocked and writes nothing', async () => {
  const { server, writes } = fakeServer({ body: JSON.stringify(BODY), portal: [] })
  expect(await answer(load(server).post())).toEqual({ blocked: true })
  expect(writes()).toEqual([])
})

// Reads right after writes must not come from the Power Pages data cache (seen stale for 15 minutes elsewhere).
test('every complaint read skips the Power Pages cache', async () => {
  const runs = [fakeServer(), fakeServer({ query: { taxonomy: '1' } }), submit({ ...BODY, attachmentName: 'po.pdf' }), finish({ notes: [NOTE] })]
  await load(runs[0].server).get()
  await load(runs[1].server).get()
  await load(runs[2].server).post()
  await load(runs[3].server).put()
  for (const { calls } of runs) {
    for (const call of calls.filter((c) => c.op.startsWith('Retrieve'))) expect(call.args.at(-1), `${call.op} ${String(call.args[1])}`).toBe(true)
  }
})

// PUT {id}: the browser has uploaded the note (or failed to); check it and release the row to the send flow.
const WAITING = { chp_complaintid: COMPLAINT_ID, chp_reference: 'CMP-00001', chp_syncstate: null, chp_attachmentname: null }
const NOTE = { annotationid: '44444444-4444-4444-8444-444444444444', filename: 'po.pdf', mimetype: 'application/pdf', filesize: 5 }
const MAX = 3_932_160 // Dataverse's 5 MB note limit counts the base64 text: 3.75 MB of file
function finish({ id = COMPLAINT_ID as unknown, rows = [WAITING] as unknown[], notes = [] as unknown[], portal }: { id?: unknown; rows?: unknown[]; notes?: unknown[]; portal?: unknown[] } = {}) {
  return fakeServer({ body: JSON.stringify({ id }), rows, notes, ...(portal ? { portal } : {}) })
}
const updated = (calls: { op: string; args: unknown[] }[]) => calls.filter((c) => c.op === 'UpdateRecord').map((c) => [c.args[0], c.args[1], JSON.parse(c.args[2] as string)])

test("PUT with one valid note names the attachment and sets the row Pending, scoped to the session's own row", async () => {
  const { server, calls } = finish({ notes: [NOTE] })
  expect(await answer(load(server).put())).toEqual({ ref: 'CMP-00001', attached: true })
  expect(updated(calls)).toEqual([['chp_complaints', COMPLAINT_ID, { chp_attachmentname: 'po.pdf', chp_syncstate: 775000000 }]])
  const row = decodeURIComponent(String(calls.find((c) => c.args[0] === 'chp_complaints')!.args[1]))
  expect(row).toContain(`chp_complaintid eq ${COMPLAINT_ID}`)
  expect(row).toContain(`_chp_account_value eq ${ACCOUNT}`)
  expect(row).toContain(`_chp_contact_value eq ${CONTACT}`)
  expect(decodeURIComponent(String(calls.find((c) => c.args[0] === 'annotations')!.args[1]))).toContain(`_objectid_value eq ${COMPLAINT_ID}`)
})

test('PUT accepts a note of exactly 3.75 MB', async () => {
  const { server } = finish({ notes: [{ ...NOTE, filesize: MAX }] })
  expect(await answer(load(server).put())).toEqual({ ref: 'CMP-00001', attached: true })
})

test.each([
  ['no note (the upload failed)', []],
  ['a .exe note', [{ ...NOTE, filename: 'x.exe', mimetype: 'application/octet-stream' }]],
  ['a note whose type does not match its name', [{ ...NOTE, mimetype: 'text/html' }]],
  ['a note over 3.75 MB', [{ ...NOTE, filesize: MAX + 1 }]],
  ['a note name with a quote', [{ ...NOTE, filename: 'a"b.pdf' }]],
  ['a note named x.constructor', [{ ...NOTE, filename: 'x.constructor' }]],
  ['two notes', [NOTE, { ...NOTE, annotationid: '55555555-5555-4555-8555-555555555555' }]],
])('PUT with %s sends it without the file', async (_case, notes) => {
  const { server, calls } = finish({ notes })
  expect(await answer(load(server).put())).toEqual({ ref: 'CMP-00001', attached: false })
  expect(updated(calls)).toEqual([['chp_complaints', COMPLAINT_ID, { chp_syncstate: 775000000 }]])
})

test.each([
  ['an id that is not a GUID', { id: "x' or 1 eq 1" }],
  ['no id', { id: null }],
  ["another contact's or account's row", { rows: [] }],
])('PUT with %s is invalid and writes nothing', async (_case, change) => {
  const { server, writes } = finish(change)
  expect(await answer(load(server).put())).toEqual({ invalid: true, field: 'id' })
  expect(writes()).toEqual([])
})

test('PUT on a row already released answers its state and writes nothing (a retried finish)', async () => {
  const { server, writes } = finish({ rows: [{ ...WAITING, chp_syncstate: 775000001, chp_attachmentname: 'po.pdf' }], notes: [NOTE] })
  expect(await answer(load(server).put())).toEqual({ ref: 'CMP-00001', attached: true })
  expect(writes()).toEqual([])
})

test('PUT as a blocked contact answers blocked and writes nothing', async () => {
  const { server, writes } = finish({ notes: [NOTE], portal: [] })
  expect(await answer(load(server).put())).toEqual({ blocked: true })
  expect(writes()).toEqual([])
})
