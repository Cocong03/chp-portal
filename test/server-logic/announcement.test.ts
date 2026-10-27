import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/announcement/announcement.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const QUERY = '$select=chp_title,chp_message&$filter=chp_active eq true&$orderby=modifiedon desc&$top=1'
const ROW = { chp_title: 'Holiday order cutoff schedule', chp_message: 'Submit orders before 3:00 PM.' }

function fakeServer({ rows = [ROW] as unknown[], down = false } = {}) {
  const calls: unknown[][] = []
  const errors: string[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: { ServerLogicName: 'announcement', QueryParameters: {}, Body: '' },
    Logger: { Log() {}, Warn() {}, Error: (m: string) => errors.push(m) },
    Connector: {
      Dataverse: {
        RetrieveMultipleRecords: (...args: unknown[]) => {
          calls.push(args)
          if (down) throw new Error('dataverse 403 Forbidden')
          return JSON.stringify({ value: rows })
        },
      },
    },
  }
  return { server, calls, errors }
}

// Decided 2026-10-09: ops edits must show on the next page load, so the read skips the Power Pages data cache
// (the Web API serves a Global-permission table from a shared cache for up to 15 minutes).
test('reads the newest active announcement live, skipping the Power Pages cache', async () => {
  const { server, calls } = fakeServer()
  expect(JSON.parse(await load(server).get())).toEqual({ title: 'Holiday order cutoff schedule', message: 'Submit orders before 3:00 PM.' })
  expect(calls).toEqual([['chp_announcements', QUERY, true]])
})

test.each([
  ['there is no active announcement', []],
  ['the announcement has no title', [{ chp_title: null, chp_message: 'x' }]],
])('returns null when %s', async (_case, rows) => {
  expect(JSON.parse(await load(fakeServer({ rows }).server).get())).toBeNull()
})

test('a missing message becomes an empty string', async () => {
  const { server } = fakeServer({ rows: [{ chp_title: 'T', chp_message: null }] })
  expect(JSON.parse(await load(server).get())).toEqual({ title: 'T', message: '' })
})

test('a failed read logs the detail and returns only the customer-safe error', async () => {
  const { server, errors } = fakeServer({ down: true })
  await expect(load(server).get()).rejects.toThrow("We couldn't load this information. Please try again.")
  expect(errors[0]).toContain('dataverse 403')
})
