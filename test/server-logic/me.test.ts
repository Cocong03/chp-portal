import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Runs the Server Logic file the way Power Pages does: top-level functions with a global `Server`.
const source = readFileSync(resolve('.powerpages-site/server-logic/me/me.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const ACCOUNT = {
  name: 'J.D. Santos Hardware & Construction Supply', chp_bccustomerno: '10482', chp_bccompanyid: 'co-1', chp_bccompanyname: 'Solid Cement',
}
const CONTACT_OPTIONS =
  '$select=fullname,emailaddress1&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyid,chp_bccompanyname)'
const ROLE_OPTIONS = '$select=contactid&$expand=powerpagecomponent_mspp_webrole_contact($select=name)'
const FORBIDDEN = { StatusCode: 403, IsSuccessStatusCode: false, ReasonPhrase: 'Forbidden', Body: '' }
const SETTINGS: Record<string, string> = {
  'BC/TenantId': 't', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'id', 'BC/ClientSecret': 'secret',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })

function fakeServer({
  user = { contactid: 'c-1', Roles: 'System.String[]' } as unknown,
  record = {} as unknown,
  roleRecord = { powerpagecomponent_mspp_webrole_contact: [{ name: 'Full Access' }] } as unknown,
  portalContacts = [{ companyNo: 'CT1' }] as unknown[],
  relations = [{ vendorNo: '10482' }] as unknown[],
  bcDown = false,
  bcFailure = undefined as unknown,
} = {}) {
  const calls: unknown[][] = []
  const http: string[] = []
  const errors: string[] = []
  return {
    calls,
    http,
    errors,
    server: {
      User: user,
      Context: { ServerLogicName: 'me' },
      SiteSetting: { Get: (name: string) => SETTINGS[name] },
      Logger: { Log() {}, Error: (m: string) => errors.push(m), Warn() {} },
      Connector: {
        Dataverse: {
          RetrieveRecord: (...args: unknown[]) => {
            calls.push(args)
            return args[2] === ROLE_OPTIONS ? roleRecord : record
          },
        },
        HttpClient: {
          PostAsync: async () => ok({ access_token: 'tok' }),
          GetAsync: async (url: string) => {
            http.push(url)
            if (bcFailure) return JSON.stringify(bcFailure)
            if (bcDown) return JSON.stringify({ StatusCode: 503, IsSuccessStatusCode: false, Body: '' })
            return ok({ value: url.includes('/MCRMContacts') ? portalContacts : relations })
          },
        },
      },
    },
  }
}

const contact = (parent: unknown) => ({ fullname: 'J.D. Santos', emailaddress1: 'full@example.com', parentcustomerid_account: parent })
const SAFE = "We couldn't load your account details."

test('returns the contact, the linked account and the web roles read from Dataverse', async () => {
  const { server, calls } = fakeServer({ record: contact(ACCOUNT) })
  expect(JSON.parse(await load(server).get())).toEqual({
    contact: { name: 'J.D. Santos', email: 'full@example.com' },
    account: { customerNo: '10482', customerName: 'J.D. Santos Hardware & Construction Supply', company: 'Solid Cement' },
    roles: ['Full Access'],
  })
  // Roles skip the Power Pages data cache: a role changed in Portal Management otherwise shows up to 15 minutes late
  // (seen on Dev 2026-10-08: Full Access added, nav stayed Finance-only).
  expect(calls).toEqual([
    ['contacts', 'c-1', CONTACT_OPTIONS],
    ['contacts', 'c-1', ROLE_OPTIONS, true],
  ])
})

// Decided 2026-10-06: BC's customerPortalAccess switches a signed-in user off immediately.
test.each([
  ['no portal-enabled BC contact', { portalContacts: [] }],
  ['portal-enabled contact belongs to another customer', { relations: [{ vendorNo: 'C1' }] }],
])('blocked when %s: no account, no roles, blocked: true', async (_case, options) => {
  const { server, calls } = fakeServer({ record: contact(ACCOUNT), ...options })
  expect(JSON.parse(await load(server).get())).toEqual({
    contact: { name: 'J.D. Santos', email: 'full@example.com' }, account: null, roles: [], blocked: true,
  })
  expect(calls).toHaveLength(1)
})

test('checks BC with the Dataverse email of the signed-in contact', async () => {
  const { server, http } = fakeServer({ record: contact(ACCOUNT) })
  await load(server).get()
  // Only Person contacts let someone in (decided 2026-10-09), never a company contact's shared email.
  expect(decodeURIComponent(http[0])).toContain("tolower(eMail) eq 'full@example.com' and customerPortalAccess eq true and type eq 'Person'")
})

test('BC down is a load error, never a block', async () => {
  const { server } = fakeServer({ record: contact(ACCOUNT), bcDown: true })
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

test('a contact without a parent account gets account null and no BC call', async () => {
  const { server, http } = fakeServer({ record: contact(null) })
  expect(JSON.parse(await load(server).get()).account).toBeNull()
  expect(http).toEqual([])
})

test('ignores the unusable Server.User.Roles text when Dataverse supplies the roles', async () => {
  const { server } = fakeServer({
    record: contact(ACCOUNT),
    roleRecord: { powerpagecomponent_mspp_webrole_contact: [{ name: 'Orders & Delivery' }, { name: 'View Only' }] },
  })
  expect(JSON.parse(await load(server).get()).roles).toEqual(['Orders & Delivery', 'View Only'])
})

test('falls back to Server.User.Roles if the role read fails, without failing me', async () => {
  const { server } = fakeServer({ user: { contactid: 'c-1', Roles: ['View Only'] }, record: contact(ACCOUNT), roleRecord: FORBIDDEN })
  expect(JSON.parse(await load(server).get()).roles).toEqual(['View Only'])
})

test('accepts the record as a JSON string or inside a {StatusCode, Body} envelope', async () => {
  const asString = fakeServer({ record: JSON.stringify(contact(ACCOUNT)) })
  expect(JSON.parse(await load(asString.server).get()).account.customerNo).toBe('10482')
  const asEnvelope = fakeServer({ record: { StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(contact(ACCOUNT)) } })
  expect(JSON.parse(await load(asEnvelope.server).get()).account.customerNo).toBe('10482')
})

test('reads roles from a comma-separated string, objects, a .NET string[] and any iterable', async () => {
  const roles = async (Roles: unknown) =>
    JSON.parse(await load(fakeServer({ user: { contactid: 'c-1', Roles }, record: contact(ACCOUNT), roleRecord: FORBIDDEN }).server).get()).roles
  expect(await roles('Authenticated Users, View Only')).toEqual(['Authenticated Users', 'View Only'])
  expect(await roles([{ Name: 'View Only' }])).toEqual(['View Only'])
  expect(await roles({ Length: 2, 0: 'Full Access', 1: 'Authenticated Users', toString: () => 'System.String[]' })).toEqual([
    'Full Access',
    'Authenticated Users',
  ])
  expect(await roles(new Set(['View Only']))).toEqual(['View Only'])
})

test('an anonymous caller gets a customer-safe error and no Dataverse call', async () => {
  const { server, calls } = fakeServer({ user: null })
  await expect(load(server).get()).rejects.toThrow(SAFE)
  expect(calls).toEqual([])
})

test.each([
  ['a failed Dataverse call', FORBIDDEN],
  ['an error envelope with only a 4xx/5xx StatusCode', { StatusCode: 500, Body: JSON.stringify({ error: { message: 'boom' } }) }],
])('%s becomes the same customer-safe error', async (_case, record) => {
  const { server } = fakeServer({ record })
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

test('a role read answered with only StatusCode 403 uses the fallback', async () => {
  const { server } = fakeServer({
    user: { contactid: 'c-1', Roles: ['View Only'] }, record: contact(ACCOUNT),
    roleRecord: { StatusCode: 403, Body: JSON.stringify({ error: { message: 'denied' } }) },
  })
  expect(JSON.parse(await load(server).get()).roles).toEqual(['View Only'])
})

test('uses no patterns the Power Pages validator rejects', () => {
  const banned = [/\brequire\(/, /\bimport\b/, /\beval\(/, /setTimeout/, /\bdelete\b/, /prototype/, /Reflect\./, /console\.log/, /with\(/, /Function\s*\(/i]
  for (const pattern of banned) expect(source).not.toMatch(pattern)
})

// Full-branch review: me logged err.message raw; a platform error can echo the request (secret, token).
test('a failure logs no client secret or token', async () => {
  const { server, errors } = fakeServer({
    record: contact(ACCOUNT),
    bcFailure: {
      StatusCode: 0, IsSuccessStatusCode: false, ServerError: true,
      ServerErrorMessage: 'echo client_secret=s%26x {"client_secret": "secret"} Authorization: Bearer abc.def.ghi',
    },
  })
  await expect(load(server).get()).rejects.toThrow(SAFE)
  expect(errors).toHaveLength(1)
  expect(errors[0]).toContain('me GET failed')
  expect(errors[0]).not.toMatch(/s%26x|"secret"|abc\.def\.ghi/)
})
