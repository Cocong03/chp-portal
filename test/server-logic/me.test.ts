import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Runs the Server Logic file the way Power Pages does: top-level functions with a global `Server`.
// Vitest runs from the repo root.
const source = readFileSync(resolve('.powerpages-site/server-logic/me/me.js'), 'utf8')

function load(server: unknown): { get: () => string } {
  return new Function('Server', `${source}\nreturn { get }`)(server)
}

const ACCOUNT = { name: 'J.D. Santos Hardware & Construction Supply', chp_bccustomerno: '10482', chp_bccompanyname: 'Solid Cement' }

function fakeServer({ user = { contactid: 'c-1', Roles: ['Authenticated Users', 'Full Access'] } as unknown, record = {} as unknown } = {}) {
  const calls: unknown[][] = []
  return {
    calls,
    server: {
      User: user,
      Logger: { Log() {}, Error() {} },
      Connector: {
        Dataverse: {
          RetrieveRecord: (...args: unknown[]) => {
            calls.push(args)
            return record
          },
        },
      },
    },
  }
}

const contact = (parent: unknown) => ({ fullname: 'J.D. Santos', emailaddress1: 'full@example.com', parentcustomerid_account: parent })

test('returns the contact, the linked account and the roles', () => {
  const { server, calls } = fakeServer({ record: contact(ACCOUNT) })
  expect(JSON.parse(load(server).get())).toEqual({
    contact: { name: 'J.D. Santos', email: 'full@example.com' },
    account: { customerNo: '10482', customerName: 'J.D. Santos Hardware & Construction Supply', company: 'Solid Cement' },
    roles: ['Authenticated Users', 'Full Access'],
  })
  expect(calls).toEqual([
    [
      'contacts',
      'c-1',
      '$select=fullname,emailaddress1&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyname)',
    ],
  ])
})

test('a contact without a parent account gets account null', () => {
  const { server } = fakeServer({ record: contact(null) })
  expect(JSON.parse(load(server).get()).account).toBeNull()
})

test('accepts the record as a JSON string or inside a {StatusCode, Body} envelope', () => {
  const asString = fakeServer({ record: JSON.stringify(contact(ACCOUNT)) })
  expect(JSON.parse(load(asString.server).get()).account.customerNo).toBe('10482')
  const asEnvelope = fakeServer({ record: { StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(contact(ACCOUNT)) } })
  expect(JSON.parse(load(asEnvelope.server).get()).account.customerNo).toBe('10482')
})

test('accepts roles as a comma-separated string or as objects', () => {
  const asString = fakeServer({ user: { contactid: 'c-1', Roles: 'Authenticated Users, View Only' }, record: contact(ACCOUNT) })
  expect(JSON.parse(load(asString.server).get()).roles).toEqual(['Authenticated Users', 'View Only'])
  const asObjects = fakeServer({ user: { contactid: 'c-1', Roles: [{ Name: 'View Only' }] }, record: contact(ACCOUNT) })
  expect(JSON.parse(load(asObjects.server).get()).roles).toEqual(['View Only'])
})

test('an anonymous caller gets a customer-safe error and no Dataverse call', () => {
  const { server, calls } = fakeServer({ user: null })
  expect(() => load(server).get()).toThrow("We couldn't load your account details.")
  expect(calls).toEqual([])
})

test('a failed Dataverse call becomes the same customer-safe error', () => {
  const { server } = fakeServer({ record: { StatusCode: 403, IsSuccessStatusCode: false, ReasonPhrase: 'Forbidden', Body: '' } })
  expect(() => load(server).get()).toThrow("We couldn't load your account details.")
})

test('uses no patterns the Power Pages validator rejects', () => {
  // The runtime (RTSL01) rejects these. `Function\s*\(` also matches an anonymous `function (x)` — seen on Dev 2026-10-04.
  const banned = [/\brequire\(/, /\bimport\b/, /\beval\(/, /setTimeout/, /\bdelete\b/, /prototype/, /Reflect\./, /console\.log/, /with\(/, /Function\s*\(/i]
  for (const pattern of banned) {
    expect(source).not.toMatch(pattern)
  }
})
