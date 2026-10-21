import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Endpoint = Record<'get' | 'post' | 'put' | 'del', () => Promise<string>>
const source = readFileSync(resolve('.powerpages-site/server-logic/drafts/drafts.js'), 'utf8')
const load = (server: unknown): Endpoint => new Function('Server', `${source}\nreturn { get, post, put, del }`)(server)

const CONTACT = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const DRAFT_ID = '33333333-3333-4333-8333-333333333333'
const PAYLOAD = { version: 1, orderType: 'single', form: { lines: [] } }
const ROW = { chp_orderdraftid: DRAFT_ID, chp_name: 'Draft #1', chp_payload: JSON.stringify(PAYLOAD), modifiedon: '2026-10-21T01:00:00Z', _chp_contact_value: CONTACT }
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })
const SETTINGS: Record<string, string> = {
  'BC/TenantId': 't', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'c', 'BC/ClientSecret': 's',
}

/** A signed-in contact with portal access on; `draftRead` answers RetrieveRecord on chp_orderdrafts. */
function fakeServer({ id = DRAFT_ID, body = '', draftRead = (): unknown => ROW } = {}) {
  const calls: { op: string; args: unknown[] }[] = []
  const errors: string[] = []
  const server = {
    User: { contactid: CONTACT },
    SiteSetting: { Get: (name: string) => SETTINGS[name] },
    Context: { ServerLogicName: 'drafts', QueryParameters: id ? { id } : {}, Body: body },
    Logger: { Log() {}, Warn() {}, Error: (m: string) => errors.push(m) },
    Connector: {
      Dataverse: {
        RetrieveRecord: (...args: unknown[]) => {
          if (args[0] === 'contacts') {
            return { contactid: CONTACT, emailaddress1: 'buyer@808.ph', parentcustomerid_account: { accountid: ACCOUNT, chp_bccustomerno: 'C00000002', chp_bccompanyid: 'co-1' } }
          }
          calls.push({ op: 'RetrieveRecord', args })
          const row = draftRead()
          return JSON.stringify(row)
        },
        RetrieveMultipleRecords: (...args: unknown[]) => {
          calls.push({ op: 'RetrieveMultipleRecords', args })
          return JSON.stringify({ value: [ROW] })
        },
        CreateRecord: (...args: unknown[]) => calls.push({ op: 'CreateRecord', args }) && '',
        UpdateRecord: (...args: unknown[]) => calls.push({ op: 'UpdateRecord', args }) && '',
        DeleteRecord: (...args: unknown[]) => calls.push({ op: 'DeleteRecord', args }) && '',
      },
      HttpClient: {
        PostAsync: async () => ok({ access_token: 'tok' }),
        GetAsync: async (url: string) =>
          decodeURIComponent(url).includes('/MCRMContacts')
            ? ok({ value: [{ companyNo: 'CT1', name: 'Buyer' }] })
            : ok({ value: [{ vendorNo: 'C00000002' }] }),
      },
    },
  }
  return { server, calls, errors, writes: () => calls.filter((c) => /Create|Update|Delete/.test(c.op)) }
}
const answer = async (result: Promise<string>) => JSON.parse(await result)
const throwing = (message: string) => () => {
  throw new Error(message)
}

test('GET by id answers notFound for a missing draft', async () => {
  const { server } = fakeServer({ draftRead: throwing('dataverse 404 Not Found') })
  expect(await answer(load(server).get())).toEqual({ notFound: true })
})

test.each(['put', 'del'] as const)('%s: a failed draft read that is not a 404 is an error, nothing written', async (method) => {
  const { server, writes } = fakeServer({ body: JSON.stringify({ payload: PAYLOAD }), draftRead: throwing('dataverse 429 Too Many Requests') })
  await expect(load(server)[method]()).rejects.toThrow("We couldn't load this information. Please try again.")
  expect(writes()).toEqual([])
})

test("someone else's draft or a non-GUID id is notFound, nothing written", async () => {
  const foreign = fakeServer({ body: JSON.stringify({ payload: PAYLOAD }), draftRead: () => ({ ...ROW, _chp_contact_value: 'other' }) })
  expect(await answer(load(foreign.server).put())).toEqual({ notFound: true })
  const bad = fakeServer({ id: "x' or 1 eq 1", body: JSON.stringify({ payload: PAYLOAD }) })
  expect(await answer(load(bad.server).del())).toEqual({ notFound: true })
  expect([...foreign.writes(), ...bad.writes()]).toEqual([])
})

test.each([
  ['no payload', {}],
  ['an array', { payload: [] }],
  ['another version', { payload: { ...PAYLOAD, version: 2 } }],
  ['over 100,000 characters', { payload: { ...PAYLOAD, pad: 'x'.repeat(100_001) } }],
])('POST with %s is invalid, nothing written', async (_case, body) => {
  const { server, writes } = fakeServer({ id: '', body: JSON.stringify(body) })
  expect(await answer(load(server).post())).toEqual({ invalid: true })
  expect(writes()).toEqual([])
})

test('POST sets contact and account from the session, never from the body', async () => {
  const { server, calls } = fakeServer({ id: '', body: JSON.stringify({ payload: PAYLOAD, contact: 'evil', account: 'evil', label: 'Mine' }) })
  await load(server).post()
  const created = JSON.parse(calls.find((c) => c.op === 'CreateRecord')!.args[1] as string)
  expect(created).toEqual({
    chp_name: 'Draft #2',
    chp_payload: JSON.stringify(PAYLOAD),
    'chp_Contact@odata.bind': `/contacts(${CONTACT})`,
    'chp_Account@odata.bind': `/accounts(${ACCOUNT})`,
  })
})

// Reads right after writes must not come from the Power Pages data cache (seen stale for 15 minutes elsewhere).
test('every draft read skips the Power Pages cache', async () => {
  const runs = [
    fakeServer({ id: '' }), // GET list
    fakeServer({ id: '', body: JSON.stringify({ payload: PAYLOAD }) }), // POST
    fakeServer({ body: JSON.stringify({ payload: PAYLOAD }) }), // PUT
  ]
  await load(runs[0].server).get()
  await load(runs[1].server).post()
  await load(runs[2].server).put()
  for (const { calls } of runs) {
    for (const call of calls.filter((c) => c.op.startsWith('Retrieve'))) {
      expect(call.args.at(-1), `${call.op} ${String(call.args[1])}`).toBe(true)
    }
  }
})
