import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { START, END, isStamped, stampText } from '../../scripts/stamp-server-logic-helpers.mjs'

const source = readFileSync(resolve('server-logic-src/bc-helpers.js'), 'utf8')
const dir = resolve('.powerpages-site/server-logic')
const endpointFiles = readdirSync(dir)
  .map((name) => join(dir, name, `${name}.js`))
  .filter((file) => existsSync(file) && readFileSync(file, 'utf8').includes(START))

test('stampText fills the region with the source, indented like the marker, and is stable', () => {
  const file = `async function get() {\n    ${START}\n    old\n    ${END}\n    return 1;\n}\n`
  const once = stampText(file, 'function a() {\n    return 1;\n}\n')
  expect(once).toBe(`async function get() {\n    ${START}\n    function a() {\n        return 1;\n    }\n    ${END}\n    return 1;\n}\n`)
  expect(stampText(once, 'function a() {\n    return 1;\n}\n')).toBe(once)
  expect(isStamped(once, 'function a() {\n    return 1;\n}\n')).toBe(true)
  expect(isStamped(file, 'function a() {\n    return 1;\n}\n')).toBe(false)
})

test('every endpoint that uses the BC helpers carries an identical copy', () => {
  expect(endpointFiles.length).toBeGreaterThan(0)
  for (const file of endpointFiles) {
    expect(isStamped(readFileSync(file, 'utf8'), source), `${file} is out of date: run node scripts/stamp-server-logic-helpers.mjs`).toBe(true)
  }
})

// Seen on Dev 2026-10-12: the runtime rejected orders.js — "prohibited pattern found - Pattern: with\s*\(" — because an
// OData string held "startswith(". The runtime scans the whole script, strings included, so every endpoint file is checked.
test('no endpoint file contains a pattern the Power Pages runtime rejects, even inside a string', () => {
  const files = readdirSync(dir)
    .map((name) => join(dir, name, `${name}.js`))
    .filter((file) => existsSync(file))
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const pattern of [/\brequire\(/, /\beval\(/, /setTimeout/, /\bdelete\b/, /prototype/, /Reflect\./, /with\s*\(/]) {
      expect(text, `${file} contains ${pattern}`).not.toMatch(pattern)
    }
  }
})

test('the helper source avoids every pattern the Power Pages validator rejects', () => {
  for (const pattern of [/\brequire\(/, /\bimport\b/, /\beval\(/, /setTimeout/, /\bdelete\b/, /prototype/, /Reflect\./, /console\.log/, /with\(/, /Function\s*\(/i]) {
    expect(source).not.toMatch(pattern)
  }
})

// Mirrors the power-pages plugin validator's brace scan (validate-serverlogic.js, findTopLevelFunctions): it skips
// comments and quoted strings but not regex literals, so a quote inside a regex literal makes it miscount braces.
function topLevelFunctions(content: string): string[] {
  const names: string[] = []
  let depth = 0
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch === '/' && content[i + 1] === '/') {
      while (i < content.length && content[i] !== '\n') i++
    } else if (ch === '/' && content[i + 1] === '*') {
      i = content.indexOf('*/', i + 2) + 1
    } else if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < content.length && content[i] !== ch; i++) if (content[i] === '\\') i++
    } else if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (depth === 0) {
      const m = content.slice(i).match(/^(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/)
      if (m) {
        names.push(m[1])
        i += m[0].length - 1
      }
    }
  }
  return names
}

test('the plugin validator sees only HTTP verb functions at the top level of every stamped endpoint', () => {
  for (const file of endpointFiles) {
    expect(topLevelFunctions(readFileSync(file, 'utf8')).filter((name) => !['get', 'post', 'put', 'patch', 'del'].includes(name)), file).toEqual([])
  }
})

// 2026-10-15: one definition of the Orders status rules, so Dashboard counts can never disagree with the Orders filter.
test('the helpers define the Orders status filter rules once', () => {
  const rules = new Function('Server', `${source}\nreturn ORDER_STATUS_FILTER`)({})
  expect(rules).toEqual({
    Open: "status eq 'Open' and completelyShipped eq false",
    'Pending Prepayment': "status eq 'Pending Prepayment' and completelyShipped eq false",
    'Ready for Dispatch': "status eq 'Released' and completelyShipped eq false",
    'Completely Shipped': 'completelyShipped eq true',
  })
})

test('no endpoint writes its own status clauses outside the shared helpers', () => {
  for (const file of endpointFiles) {
    const text = readFileSync(file, 'utf8')
    // Every helpers region removed: an endpoint with several methods (drafts) carries one per method.
    const own = text
      .split(START)
      .map((part, index) => (index === 0 ? part : part.slice(part.indexOf(END))))
      .join('')
    expect(own, file).not.toMatch(/completelyShipped eq/)
  }
})

// 2026-10-16: GET endpoints read BC alongside the BC portal-access check (about 1 s faster per call); nothing is returned
// until the check passes.
const SETTINGS: Record<string, string> = {
  'BC/TenantId': 't', 'BC/EnvironmentName': 'DEV', 'BC/ApiBasePath': '/api/pasi/mcrm/v1.0', 'BC/ClientId': 'c', 'BC/ClientSecret': 's',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })
const down = JSON.stringify({ StatusCode: 503, IsSuccessStatusCode: false, ReasonPhrase: 'Service Unavailable', Body: '' })

function helperServer({ contacts = [{ companyNo: 'CT1', name: 'Buyer' }] as unknown[], accessDown = false } = {}) {
  const http: string[] = []
  let tokens = 0
  let releaseAccess = () => {}
  const accessGate = new Promise<void>((resolve) => (releaseAccess = resolve))
  const server = {
    User: { contactid: 'c-1' },
    SiteSetting: { Get: (name: string) => SETTINGS[name] },
    Logger: { Log() {}, Error() {}, Warn() {} },
    Context: { ServerLogicName: 'test' },
    Connector: {
      Dataverse: {
        RetrieveRecord: () => ({
          contactid: 'c-1', emailaddress1: 'Buyer@808.ph',
          parentcustomerid_account: { accountid: 'acc-2', name: '808 TRADING', chp_bccustomerno: 'C00000002', chp_bccompanyid: 'co-1' },
        }),
      },
      HttpClient: {
        PostAsync: async () => {
          tokens++
          return ok({ access_token: 'tok' })
        },
        GetAsync: async (url: string) => {
          const plain = decodeURIComponent(url)
          http.push(plain)
          if (plain.includes('/MCRMContacts')) {
            await accessGate
            return accessDown ? down : ok({ value: contacts })
          }
          if (plain.includes('/mcrmBusinessRelation')) return ok({ value: [{ vendorNo: 'C00000002' }] })
          return ok({ value: [{ salesOrderNo: 'SOR1' }] })
        },
      },
    },
  }
  const h = new Function('Server', `${source}\nreturn { scopedRead, bcGet }`)(server) as {
    scopedRead: <T>(work: (scope: { customerNo: string }) => Promise<T>) => Promise<T>
    bcGet: (scope: unknown, entity: string, query: string) => Promise<{ value: unknown[] }>
  }
  return { h, http, releaseAccess, tokens: () => tokens }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('scopedRead starts the endpoint read before the access check answers, then returns it once access passes', async () => {
  const { h, http, releaseAccess, tokens } = helperServer()
  const result = h.scopedRead(async (scope) => (await h.bcGet(scope, 'mcrmSalesOrders', '$top=1')).value)
  await tick()
  expect(http.some((u) => u.includes('/mcrmSalesOrders'))).toBe(true)
  expect(http.some((u) => u.includes('/mcrmBusinessRelation'))).toBe(false)
  releaseAccess()
  expect(await result).toEqual([{ salesOrderNo: 'SOR1' }])
  expect(tokens()).toBe(1)
})

test('scopedRead hands the work the session customer only', async () => {
  const { h, releaseAccess } = helperServer()
  releaseAccess()
  expect(await h.scopedRead(async (scope) => scope.customerNo)).toBe('C00000002')
})

test('scopedRead throws blocked, never the data, when BC portal access is off', async () => {
  const { h, releaseAccess } = helperServer({ contacts: [] })
  releaseAccess()
  await expect(h.scopedRead(async () => 'secret')).rejects.toMatchObject({ blocked: true })
})

test('scopedRead: a failed access check is an error (not blocked), even when the read failed too', async () => {
  const { h, releaseAccess } = helperServer({ accessDown: true })
  const result = h.scopedRead(async () => {
    throw new Error('read failed')
  })
  releaseAccess()
  const err = await result.catch((e: { message: string; blocked?: boolean }) => e)
  expect(err.message).toContain('503')
  expect(err.blocked).toBeUndefined()
})

test('scopedRead: a failed read with access on is that error', async () => {
  const { h, releaseAccess } = helperServer()
  releaseAccess()
  await expect(h.scopedRead(async () => {
    throw new Error('read failed')
  })).rejects.toThrow('read failed')
})
