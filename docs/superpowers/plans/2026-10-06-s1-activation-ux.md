# S1 Follow-up D — Activation Messages, Link Check, Forgot Password, BC Access Block — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Activation tells customers what is happening ("needs help", "already active").
- Used or expired links show the expired card on open.
- Forgot password works end to end with branded email.
- Switching a contact's BC `customerPortalAccess` off blocks them immediately.

**Architecture:**
- **Flows:** the request-activation flow gains statuses, invitation cancelling, a 24 h expiry and the email in its link. Two new flows: a tiny anonymous **Check activation link** flow and a Dataverse-triggered **Send password reset** flow.
- **BC access check:** the shared Server Logic helpers gain a live check (`hasPortalAccess`) used by `sessionScope` and `me`. A blocked call returns `{"blocked":true}` and the SPA turns that into a `BlockedError` and a full-page card.
- **Password reset:** the SPA posts to Power Pages' built-in ForgotPassword and ResetPassword MVC endpoints behind two new screens.

**Tech Stack:** React 19, TS, React Router, TanStack Query, RHF + Zod, Vitest + RTL; Power Pages Server Logic; Power Automate (Dataverse, Outlook, Power Pages trigger); Python + Dataverse Web API scripts.

**Spec:** `docs/superpowers/specs/2026-10-06-s1-activation-ux-design.md`

## Global Constraints

- **Dev only:**
  - Dataverse `org380257ac`, site `https://chp-portal-dev.powerappsportals.com` (private), site id `f44e98b4-3da3-4f8d-8f79-fbb244454741`, BC environment `DEV`.
  - Steps marked **APPROVAL** change Dev: stop and get the user's yes.
- **Copy (exact):**
  - Needs-help heading "We couldn't activate this email automatically". Body: "This email address is linked to more than one Concreat customer account, so it needs to be set up by our team. Please contact the Concreat Customer Service Center at (02) 8849-3600."
  - Already-active heading "Your account is already active". Body: "Sign in with your email and password. If you've forgotten your password, you can reset it." Buttons **Sign in** / **Reset password**.
  - Expired activation link: "This activation link is invalid, has already been used, or has expired."
  - Check-your-email text ends "…The link can be used once and expires in 24 hours."
  - Reset request result: "If this email has an active Concreat Connect account, we've sent a link to reset your password. The link expires in 1 hour."
  - Expired reset link: "This reset link is invalid or has expired."
  - Blocked heading "Your access has been turned off". Body: "Your access to Concreat Connect has been turned off. Please contact the Concreat Customer Service Center at (02) 8849-3600."
- **Middle ground:** an email on no portal-enabled BC contact always gets `ok` / "Check your email".
- **Activation link:** `{chp_SiteUrl}/activate/complete?code={code}&email={encodeUriComponent(email)}`, expiring `addHours(utcNow(), 24)`.
- **Status values:**
  - `adx_invitation` inactive = `statecode` 1 / `statuscode` 2.
  - Handled reset email = **Canceled** (`statecode` 2 / `statuscode` 5). This clarifies the spec's "Completed": Canceled means Dataverse never sends it.
- **Built-in Power Pages forms (probed on Dev 2026-10-06):**
  - `POST /Account/Login/ForgotPassword` takes `__RequestVerificationToken`, `Email`.
  - `POST /Account/Login/ResetPassword` takes `__RequestVerificationToken`, `UserId`, `Code`, `Password`, `ConfirmPassword`.
  - Reset links use the query keys `UserId` and `Code`.
- **Runtime fact (clarifies the spec):** a thrown Server Logic error always reaches the browser as the generic "Exception occurred…". So a **blocked** call **returns** `{"blocked":true}` (200, no data), and the SPA's `serverLogic` throws `BlockedError` when the data has `blocked === true`.
- **Server Logic rules:**
  - Only top-level verbs; no `Function\s*\(` (arrow callbacks only); no quotes inside regex literals.
  - Read settings with `Server.SiteSetting.Get`.
  - Edit helpers only in `server-logic-src/bc-helpers.js`, then `node scripts/stamp-server-logic-helpers.mjs`.
- **Flows:**
  - Solution-aware in `ConcreatHub`; env values only as env-var parameters with `defaultValue: ""`.
  - Secrets/tokens in HTTP actions use `runtimeConfiguration.secureData` inputs+outputs.
  - The Power Pages trigger input property is `text`, titled as the input name.
- **Deploy chain:** always `npm test && npm run lint && <validator> && pac org who … && npm run build && pac pages upload-code-site --rootPath .`, joined with `&&` so a failure stops it.
- **Commits:** cite S1-03 (activation/flows), S1-06 (helpers), S1-07 (`me`). End with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't push.

## Review Focus

1. **The BC access check must use the email from Dataverse, never the request.** A caller adding `?email=` must not change the result (Task 1 test).
2. **A BC outage during the access check must give the normal load error, not "blocked"**, so customers aren't told they're switched off because BC is down (Tasks 1 and 2 tests).
3. **`me` erroring with `BlockedError` must not loop.** The query-cache handler re-checks `me` only for *other* queries (Task 3 test).
4. **Cached `me` data plus a blocked refetch must still show the blocked card, not the old nav** (Task 3 test).
5. **A failure of the link check must still let a valid link through** (form shown); Power Pages still rejects a used code on submit (Task 7 test).

---

### Task 1: BC access check in the shared helpers (`sessionScope`), blocked reply

**Files:**
- Modify: `server-logic-src/bc-helpers.js`, `.powerpages-site/server-logic/company/company.js` (`sessionScope()` → `await sessionScope()`, then re-stamp)
- Test: `test/server-logic/company.test.ts` (rewrite)

**Interfaces:**
- **Produces:**
  - `async sessionScope()` → `{ contactId, customerNo, companyId, customerName }`, or throws a blocked error (`err.blocked === true`);
  - `async hasPortalAccess(scope, email)` → boolean;
  - `blockedError()` → Error;
  - `respond(work)` → resolves `'{"blocked":true}'` on a blocked error.

- [ ] **Step 1: Write the failing tests.** Replace `test/server-logic/company.test.ts` with:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/company/company.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1',
  'BC/EnvironmentName': 'DEV',
  'BC/ApiBasePath': '/api/pasi/mcrm/v1.0',
  'BC/ClientId': 'client-1',
  'BC/ClientSecret': 's&x=1',
}
const ROW = {
  Customer_No: 'C00000009', Name: 'BESTRADE COMMODITY SALES CORP.', Address: '12 Main St', Address_2: '', City: 'Pasig',
  County: 'NCR', Post_Code: '1600', VATRegNo: '123-456', Phone_No: '0917', EMail: 'ops@bestrade.ph',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })

function fakeServer({
  user = { contactid: 'c-1' } as unknown,
  email = 'Buyer@Bestrade.ph' as unknown,
  account = { name: 'BESTRADE COMMODITY SALES CORP.', chp_bccustomerno: 'C00000009', chp_bccompanyid: 'co-1' } as unknown,
  portalContacts = [{ companyNo: 'CT0001' }] as unknown[],
  relations = [{ vendorNo: 'C00000009' }] as unknown[],
  rows = [ROW] as unknown[],
  tokenStatus = 200,
  tokenResponse = undefined as unknown,
  bcDown = false,
  settings = SETTINGS,
  context = { ServerLogicName: 'company', QueryParameters: {}, Body: '' } as unknown,
} = {}) {
  const http: { method: string; url: string; body?: string; headers?: unknown; contentType?: string }[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const server = {
    User: user,
    Context: context,
    SiteSetting: { Get: (name: string) => settings[name] },
    Logger: { Log() {}, Error: (m: string) => errors.push(m), Warn: (m: string) => warnings.push(m) },
    Connector: {
      Dataverse: { RetrieveRecord: () => ({ contactid: 'c-1', emailaddress1: email, parentcustomerid_account: account }) },
      HttpClient: {
        PostAsync: async (url: string, body: string, headers: unknown, contentType: string) => {
          http.push({ method: 'POST', url, body, headers, contentType })
          return JSON.stringify(
            tokenResponse ?? { StatusCode: tokenStatus, IsSuccessStatusCode: tokenStatus < 400, Body: JSON.stringify({ access_token: 'tok-1' }) },
          )
        },
        GetAsync: async (url: string, headers: unknown) => {
          http.push({ method: 'GET', url, headers })
          if (bcDown) return JSON.stringify({ StatusCode: 503, IsSuccessStatusCode: false, ReasonPhrase: 'Service Unavailable', Body: '' })
          if (url.includes('/MCRMContacts')) return ok({ value: portalContacts })
          if (url.includes('/mcrmBusinessRelation')) return ok({ value: relations })
          return ok({ value: rows })
        },
      },
    },
  }
  return { server, http, errors, warnings }
}

const SAFE = "We couldn't load this information. Please try again."
const call = (http: { url: string }[], entity: string) => http.find((c) => c.url.includes(`/${entity}?`))!

test("returns the signed-in customer's BC card in the wireframe's field names", async () => {
  const { server } = fakeServer()
  expect(JSON.parse(await load(server).get())).toEqual({
    customerNo: 'C00000009',
    customerName: 'BESTRADE COMMODITY SALES CORP.',
    address: '12 Main St, Pasig, NCR, 1600',
    vatRegNumber: '123-456',
    phone: '0917',
    email: 'ops@bestrade.ph',
  })
})

// Power Pages form-encodes a JSON object body itself; a raw "a=b&c=d" string fails with
// "'g' is an invalid start of a value" (seen on Dev 2026-10-04; matches the Microsoft Learn Graph sample).
test('gets a client-credentials token, passing the form fields as a JSON object for the platform to encode', async () => {
  const { server, http } = fakeServer()
  await load(server).get()
  const token = http[0]
  expect(token.url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token')
  expect(token.contentType).toBe('application/x-www-form-urlencoded')
  expect(JSON.parse(token.body!)).toEqual({
    grant_type: 'client_credentials',
    client_id: 'client-1',
    client_secret: 's&x=1',
    scope: 'https://api.businesscentral.dynamics.com/.default',
  })
})

test("calls BC in the session's company with an escaped, encoded filter and the bearer token", async () => {
  const { server, http } = fakeServer({
    account: { name: 'X', chp_bccustomerno: "O'1 2", chp_bccompanyid: 'co-1' },
    relations: [{ vendorNo: "O'1 2" }],
    rows: [{ ...ROW, Customer_No: "O'1 2" }],
  })
  await load(server).get()
  const get = call(http, 'mcrmCustomers')
  expect(get.url).toBe(
    "https://api.businesscentral.dynamics.com/v2.0/tenant-1/DEV/api/pasi/mcrm/v1.0/companies(co-1)/mcrmCustomers?$filter=Customer_No%20eq%20'O''1%202'&$select=Customer_No%2CName%2CAddress%2CAddress_2%2CCity%2CCounty%2CPost_Code%2CVATRegNo%2CPhone_No%2CEMail",
  )
  expect(get.headers).toEqual({ Authorization: 'Bearer tok-1', Accept: 'application/json' })
})

test('ignores customer, company or email values sent in the request', async () => {
  const { server, http } = fakeServer({
    context: {
      ServerLogicName: 'company',
      QueryParameters: { customerNo: 'C99', companyId: 'other', email: 'evil@x.ph' },
      Body: '{"customerNo":"C99","email":"evil@x.ph"}',
    },
  })
  await load(server).get()
  expect(call(http, 'mcrmCustomers').url).toContain('companies(co-1)/')
  expect(call(http, 'mcrmCustomers').url).toContain("'C00000009'")
  expect(http.map((c) => c.url).join(' ')).not.toMatch(/C99|evil/)
})

test('checks BC portal access with the Dataverse email, lower-cased and quoted, only portal-enabled contacts', async () => {
  const { server, http } = fakeServer({ email: "O'Neil@Bestrade.PH" })
  await load(server).get()
  expect(decodeURIComponent(call(http, 'MCRMContacts').url)).toContain(
    "$filter=tolower(eMail) eq 'o''neil@bestrade.ph' and customerPortalAccess eq true",
  )
  expect(decodeURIComponent(call(http, 'mcrmBusinessRelation').url)).toContain(
    "$filter=(contactNo eq 'CT0001') and linktoTable eq 'Customer'",
  )
})

test.each([
  ['no BC contact with portal access for this email', { portalContacts: [] }],
  ['portal-enabled contacts belong to another customer', { relations: [{ vendorNo: 'C00000001' }] }],
  ['the contact has no email', { email: '' }],
])('blocked when %s: returns {blocked:true} and reads no customer data', async (_case, options) => {
  const { server, http, warnings } = fakeServer(options as Parameters<typeof fakeServer>[0])
  expect(JSON.parse(await load(server).get())).toEqual({ blocked: true })
  expect(http.some((c) => c.url.includes('/mcrmCustomers'))).toBe(false)
  expect(warnings.join(' ')).toContain('blocked')
})

test.each([
  ['BC returns a different customer', { rows: [{ ...ROW, Customer_No: 'C00000001' }] }],
  ['BC returns no customer', { rows: [] }],
  ['nobody is signed in', { user: null }],
  ['the contact has no linked account', { account: null }],
  ['BC rejects the client credentials', { tokenStatus: 401 }],
  ['a BC site setting is missing', { settings: { ...SETTINGS, 'BC/ClientSecret': '' } }],
  ['BC is down during the access check (an error, never "blocked")', { bcDown: true }],
])('%s → only the customer-safe error', async (_case, options) => {
  const { server } = fakeServer(options as Parameters<typeof fakeServer>[0])
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

test('makes no BC call when nobody is signed in', async () => {
  const { server, http } = fakeServer({ user: null })
  await expect(load(server).get()).rejects.toThrow(SAFE)
  expect(http).toEqual([])
})

// Seen on Dev 2026-10-04: the log only said "bc-0" — status 0 means the call never got an HTTP answer.
test('a call that gets no HTTP answer logs the failing step and the platform reason, with secrets removed', async () => {
  const { server, errors } = fakeServer({
    tokenResponse: {
      StatusCode: 0, IsSuccessStatusCode: false, ReasonPhrase: null, ServerError: true,
      ServerErrorMessage:
        'Request to login.microsoftonline.com failed: client_secret=s%26x%3D1 {"client_secret": "s&x=1"} Authorization: Bearer abc.def.ghi',
    },
  })
  await expect(load(server).get()).rejects.toThrow(SAFE)
  expect(errors).toHaveLength(1)
  expect(errors[0]).toContain('token')
  expect(errors[0]).toContain('Request to login.microsoftonline.com failed')
  expect(errors[0]).not.toContain('s%26x%3D1')
  expect(errors[0]).not.toContain('s&x=1')
  expect(errors[0]).not.toContain('abc.def.ghi')
})

// Seen on Dev 2026-10-04: "token 401 Unauthorized" alone doesn't say why Microsoft rejected the credentials.
test("a rejected token request logs Microsoft's error code and description", async () => {
  const { server, errors } = fakeServer({
    tokenResponse: {
      StatusCode: 401, IsSuccessStatusCode: false, ReasonPhrase: 'Unauthorized',
      Body: JSON.stringify({ error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.' }),
    },
  })
  await expect(load(server).get()).rejects.toThrow(SAFE)
  expect(errors[0]).toContain('token 401 Unauthorized')
  expect(errors[0]).toContain('AADSTS7000215')
})
```

- [ ] **Step 2: Run it.**

Run: `npx vitest run test/server-logic/company.test.ts`
Expected: FAIL. The access-check, blocked and request-email tests fail (no MCRMContacts call; blocked cases return the card).

- [ ] **Step 3: Change the helpers** in `server-logic-src/bc-helpers.js`.

Replace the whole `sessionScope` function with:

```js
// Customer and company come only from the signed-in contact's Account (architecture rule 3), and BC must still
// let this contact into the portal (customerPortalAccess, decided 2026-10-06).
async function sessionScope() {
    var user = Server.User;
    if (!user || !user.contactid) {
        throw new Error("not-signed-in");
    }
    var contact = parseResult(
        Server.Connector.Dataverse.RetrieveRecord(
            "contacts",
            user.contactid,
            "$select=contactid,emailaddress1&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyid)"
        ),
        "dataverse"
    );
    var account = contact.parentcustomerid_account;
    if (!account || !account.chp_bccustomerno || !account.chp_bccompanyid) {
        throw new Error("no-account");
    }
    var scope = { contactId: user.contactid, customerNo: account.chp_bccustomerno, companyId: account.chp_bccompanyid, customerName: account.name || "" };
    if (!(await hasPortalAccess(scope, contact.emailaddress1))) {
        throw blockedError();
    }
    return scope;
}

// True while BC has a contact with this email, customerPortalAccess = true, linked to the session's customer.
// The email comes from Dataverse, never from the request. A BC failure throws (an error, not a block).
// ponytail: two BC calls per request; add a short-lived cache if Dev timings show it matters.
async function hasPortalAccess(scope, email) {
    var address = String(email || "").trim().toLowerCase();
    if (!address) {
        return false;
    }
    var contacts = await bcGet(
        scope,
        "MCRMContacts",
        odataQuery({ $filter: "tolower(eMail) eq " + odataLiteral(address) + " and customerPortalAccess eq true", $select: "companyNo", $top: "20" })
    );
    var companies = ((contacts && contacts.value) || []).map((row) => row.companyNo).filter((no) => no);
    if (companies.length === 0) {
        return false;
    }
    var relations = await bcGet(
        scope,
        "mcrmBusinessRelation",
        odataQuery({
            $filter: "(" + companies.map((no) => "contactNo eq " + odataLiteral(no)).join(" or ") + ") and linktoTable eq 'Customer'",
            $select: "vendorNo"
        })
    );
    return ((relations && relations.value) || []).some((row) => row.vendorNo === scope.customerNo);
}

function blockedError() {
    var err = new Error("blocked: BC customerPortalAccess is off");
    err.blocked = true;
    return err;
}
```

In `respond`, make the first lines of the `catch` block:

```js
    } catch (err) {
        // A blocked caller gets a normal reply with no data: thrown messages never reach the browser.
        if (err && err.blocked) {
            Server.Logger.Warn(Server.Context.ServerLogicName + " " + err.message);
            return JSON.stringify({ blocked: true });
        }
```

(keep the rest of the existing catch block unchanged).

In `.powerpages-site/server-logic/company/company.js`, change `var scope = sessionScope();` to `var scope = await sessionScope();`.

Run: `node scripts/stamp-server-logic-helpers.mjs`
Expected: `stamped: …company.js`.

- [ ] **Step 4: Run the tests.**

Run: `npx vitest run test/server-logic`
Expected: PASS, including `bc-helpers.test.ts`: stamped copy identical, no banned patterns, validator scan.

Then run:

```bash
PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6
echo "{\"cwd\":\"$(pwd -W)\"}" | node "$PP/skills/add-server-logic/scripts/validate-serverlogic.js"
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add server-logic-src/bc-helpers.js .powerpages-site/server-logic/company/company.js test/server-logic/company.test.ts
git commit -m "S1-06: live BC portal-access check in sessionScope; blocked callers get {blocked:true}

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `me` checks BC portal access

**Files:**
- Modify: `.powerpages-site/server-logic/me/me.js` (async, carries the helper region)
- Test: `test/server-logic/me.test.ts` (rewrite)

**Interfaces:**
- **Consumes:** `hasPortalAccess`, `parseResult` (Task 1).
- **Produces:** `GET me` → `{ contact, account, roles }`, or `{ contact, account: null, roles: [], blocked: true }`.

- [ ] **Step 1: Write the failing tests.** Replace `test/server-logic/me.test.ts` with:

```ts
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
} = {}) {
  const calls: unknown[][] = []
  const http: string[] = []
  return {
    calls,
    http,
    server: {
      User: user,
      Context: { ServerLogicName: 'me' },
      SiteSetting: { Get: (name: string) => SETTINGS[name] },
      Logger: { Log() {}, Error() {}, Warn() {} },
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
  expect(calls).toEqual([
    ['contacts', 'c-1', CONTACT_OPTIONS],
    ['contacts', 'c-1', ROLE_OPTIONS],
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
  expect(decodeURIComponent(http[0])).toContain("tolower(eMail) eq 'full@example.com' and customerPortalAccess eq true")
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
```

- [ ] **Step 2: Run it.**

Run: `npx vitest run test/server-logic/me.test.ts`
Expected: FAIL. `get()` isn't async and makes no BC calls; the blocked and BC tests fail.

- [ ] **Step 3: Rewrite `.powerpages-site/server-logic/me/me.js`:**

```js
// Server Logic: me (S1-07)
// Purpose: the signed-in contact, their active account (Contact.parentcustomerid) and web roles,
// or { blocked: true } when BC has switched their portal access off (decided 2026-10-06).
// API URL: https://<site>/_api/serverlogics/me
// Scope comes only from the session (Server.User); nothing is read from the request.

async function get() {
    // #region bc-helpers (generated from server-logic-src/bc-helpers.js — do not edit)
    // #endregion bc-helpers

    // Roles arrive as a .NET string[] on the Power Pages runtime (Length + indexer; String() gives "System.String[]").
    // Also accept a JS array, any iterable, an array of { Name } objects, or a comma-separated string.
    function roleNames(roles) {
        var list = [];
        if (typeof roles === "string") {
            list = roles.split(",");
        } else if (roles) {
            var count = typeof roles.length === "number" ? roles.length : roles.Length;
            if (typeof count === "number") {
                for (var i = 0; i < count; i++) {
                    list.push(roles[i]);
                }
            } else if (typeof roles[Symbol.iterator] === "function") {
                list = Array.from(roles);
            }
        }
        // Arrow callbacks only: the runtime validator (RTSL01) rejects anonymous function expressions, even in comments.
        return list
            .map((role) => (typeof role === "string" ? role.trim() : String((role && (role.Name || role.name)) || "").trim()))
            .filter((name) => name.length > 0);
    }

    try {
        Server.Logger.Log("me GET called");
        var user = Server.User;
        if (!user || !user.contactid) {
            throw new Error("No signed-in contact");
        }

        var contact = parseResult(
            Server.Connector.Dataverse.RetrieveRecord(
                "contacts",
                user.contactid,
                "$select=fullname,emailaddress1&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyid,chp_bccompanyname)"
            ),
            "dataverse"
        );
        var account = contact.parentcustomerid_account;
        var who = { name: contact.fullname || "", email: contact.emailaddress1 || "" };

        if (account && account.chp_bccustomerno && account.chp_bccompanyid) {
            var scope = { contactId: user.contactid, customerNo: account.chp_bccustomerno, companyId: account.chp_bccompanyid, customerName: account.name || "" };
            if (!(await hasPortalAccess(scope, contact.emailaddress1))) {
                Server.Logger.Warn("me blocked: BC customerPortalAccess is off");
                return JSON.stringify({ contact: who, account: null, roles: [], blocked: true });
            }
        }

        // Server.User.Roles reached scripts as the text "System.String[]" on Dev (2026-10-04),
        // so read the contact's web roles from Dataverse; fall back to Server.User.Roles if that read fails.
        var roles;
        try {
            var withRoles = parseResult(
                Server.Connector.Dataverse.RetrieveRecord(
                    "contacts",
                    user.contactid,
                    "$select=contactid&$expand=powerpagecomponent_mspp_webrole_contact($select=name)"
                ),
                "dataverse"
            );
            roles = roleNames(withRoles.powerpagecomponent_mspp_webrole_contact || []);
        } catch (roleErr) {
            Server.Logger.Warn("me: web role read failed, using Server.User.Roles: " + roleErr.message);
            roles = roleNames(user.Roles);
        }

        return JSON.stringify({
            contact: who,
            account: account
                ? { customerNo: account.chp_bccustomerno || "", customerName: account.name || "", company: account.chp_bccompanyname || "" }
                : null,
            roles: roles
        });
    } catch (err) {
        Server.Logger.Error("me GET failed: " + err.message);
        // Customers see this text; internal details stay in the log.
        throw new Error("We couldn't load your account details.");
    }
}
```

Run: `node scripts/stamp-server-logic-helpers.mjs`
Expected: `stamped: …me.js`.

- [ ] **Step 4: Run the tests and the validator.**

Run: `npx vitest run test/server-logic`
Expected: PASS. `bc-helpers.test.ts` now covers both `company` and `me`.

Then run the validator command from Task 1 Step 4.
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add .powerpages-site/server-logic/me/me.js test/server-logic/me.test.ts
git commit -m "S1-07: me checks BC portal access (blocked: true, no account/roles); carries the shared helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: App — `BlockedError`, query-cache hook, "access turned off" card

**Files:**
- Modify: `src/api/serverLogic.ts`, `src/api/types.ts`, `src/mocks/index.ts`, `src/main.tsx`, `src/test/render.tsx`, `src/layout/AppShell.tsx`
- Create: `src/api/queryClient.ts`, `src/layout/AccessBlocked.tsx`
- Test: `src/api/queryClient.test.ts`, `src/api/serverLogic.test.ts`, `src/layout/AppShell.test.tsx`

**Interfaces:**
- **Produces:**
  - `BLOCKED_MESSAGE`, `class BlockedError extends ApiError` (status 403);
  - `createQueryClient(config?: QueryClientConfig): QueryClient`;
  - `MeDto.blocked?: boolean`;
  - `<AccessBlocked />`.

- [ ] **Step 1: Write the failing tests.**

`src/api/queryClient.test.ts`:

```ts
import { BlockedError } from './serverLogic'
import { createQueryClient } from './queryClient'

test('a blocked answer from a data query re-checks me', async () => {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  await client.fetchQuery({ queryKey: ['company'], queryFn: () => Promise.reject(new BlockedError()) }).catch(() => {})
  expect(spy).toHaveBeenCalledWith({ queryKey: ['me'] })
})

test('a blocked me does not re-check itself (no loop)', async () => {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  await client.fetchQuery({ queryKey: ['me'], queryFn: () => Promise.reject(new BlockedError()) }).catch(() => {})
  expect(spy).not.toHaveBeenCalled()
})
```

Add to `src/api/serverLogic.test.ts`:
- Inside `describe('on the dev server', …)`:

```ts
  test('a blocked answer becomes a BlockedError', async () => {
    sessionStorage.setItem(MOCK_SESSION_KEY, 'blocked@test.ph')
    await expect(serverLogic('me')).rejects.toBeInstanceOf(BlockedError)
  })
```

- Inside `describe('on the deployed site', …)`:

```ts
  test('a {blocked:true} reply from the server becomes a BlockedError', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/_layout/tokenhtml'
        ? new Response('<input name="__RequestVerificationToken" value="t" />')
        : new Response(JSON.stringify({ success: true, data: '{"blocked":true}' })),
    ))
    const error = await serverLogic('company').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BlockedError)
    expect((error as BlockedError).status).toBe(403)
  })
```

- Change its import to `import { ApiError, BlockedError, GENERIC_ERROR, serverLogic } from './serverLogic'`.

Add to `src/layout/AppShell.test.tsx` (it uses `signInAs` with dev mocks):

```ts
test('a contact BC has switched off sees only the access-turned-off card', async () => {
  signInAs('blocked@test.ph')
  expect(await screen.findByRole('heading', { name: 'Your access has been turned off' })).toBeInTheDocument()
  expect(screen.getByText(/Please contact the Concreat Customer Service Center at \(02\) 8849-3600\./)).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Portal sections' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  expect(document.title).toBe('Access turned off — Concreat Connect')
})

test('cached account data plus a blocked refetch shows the card, not the old nav', async () => {
  const { client } = signInAs('full@test.ph')
  await navLabels()
  vi.mocked(serverLogic).mockRejectedValueOnce(new BlockedError())
  await act(() => client.invalidateQueries({ queryKey: ['me'] }))
  expect(await screen.findByRole('heading', { name: 'Your access has been turned off' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Portal sections' })).not.toBeInTheDocument()
})
```

Change its import to `import { ApiError, BlockedError, serverLogic } from '@/api/serverLogic'`.

- [ ] **Step 2: Run them.**

Run: `npx vitest run src/api src/layout`
Expected: FAIL. `BlockedError` and `queryClient` don't exist, and there's no blocked mock or card.

- [ ] **Step 3: Implement.**

In `src/api/serverLogic.ts`, after the `ApiError` class:

```ts
export const BLOCKED_MESSAGE = 'Your access to Concreat Connect has been turned off.'

/** BC switched this contact's portal access off. Server Logic answers {"blocked":true} (thrown messages never reach the browser). */
export class BlockedError extends ApiError {
  constructor() {
    super(403, BLOCKED_MESSAGE)
    this.name = 'BlockedError'
  }
}

const isBlocked = (data: unknown) => typeof data === 'object' && data !== null && (data as { blocked?: unknown }).blocked === true
```

In `serverLogic`, change the mock return to:

```ts
    const data = mock({ method, query, body })
    if (isBlocked(data)) throw new BlockedError()
    return data as T
```

and the final return to:

```ts
  const data = parseData(envelope?.Data ?? envelope?.data)
  if (isBlocked(data)) throw new BlockedError()
  return data as T
```

`src/api/queryClient.ts`:

```ts
import { QueryCache, QueryClient, type QueryClientConfig } from '@tanstack/react-query'
import { BlockedError } from './serverLogic'

/** The app's QueryClient. A blocked answer from any data query re-checks `me`, whose BlockedError shows the card. */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  const client = new QueryClient({
    ...config,
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (error instanceof BlockedError && query.queryKey[0] !== 'me') void client.invalidateQueries({ queryKey: ['me'] })
      },
    }),
  })
  return client
}
```

In `src/main.tsx`:
- replace the `QueryClient` import and construction with `import { QueryClientProvider } from '@tanstack/react-query'`, `import { createQueryClient } from './api/queryClient'`;
- use `const queryClient = createQueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })`.

In `src/test/render.tsx`:
- replace `new QueryClient({ defaultOptions: { queries: { retry: false } } })` with `createQueryClient({ defaultOptions: { queries: { retry: false } } })`;
- import it from `@/api/queryClient`, keeping `QueryClientProvider`.

In `src/api/types.ts`, add to `MeDto`:

```ts
  /** BC switched this contact's portal access off (customerPortalAccess = false). */
  blocked?: boolean
```

In `src/mocks/index.ts`:
- add `['blocked@test.ph', ['Full Access']]` to `ROLES_BY_EMAIL`;
- at the top of the `me` mock body, after `const email = …`, add:

```ts
    if (email === 'blocked@test.ph') return { contact: { name: 'J.D. Santos', email }, account: null, roles: [], blocked: true }
```

`src/layout/AccessBlocked.tsx`:

```tsx
import { signOut } from '@/auth/session'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { PageHeader } from '@/ui/PageHeader'

// BC switched this contact's portal access off (customerPortalAccess = false, decided 2026-10-06).
export function AccessBlocked() {
  usePageTitle('Access turned off')
  return (
    <div className="flex flex-col items-start gap-4">
      <PageHeader
        title="Your access has been turned off"
        caption="Your access to Concreat Connect has been turned off. Please contact the Concreat Customer Service Center at (02) 8849-3600."
      />
      <Button variant="outline" onClick={signOut}>
        Sign out
      </Button>
    </div>
  )
}
```

In `src/layout/AppShell.tsx`:
- import `BlockedError` from `@/api/serverLogic` and `AccessBlocked` from `./AccessBlocked`;
- replace the roles line with:

```ts
  // Blocked in BC wins over any cached account data; no linked account means no business access yet.
  const blocked = me.error instanceof BlockedError
  const roles = !blocked && me.data?.account ? me.data.roles : []
```

- make the first branch of the content chain:

```tsx
  if (blocked) {
    content = <AccessBlocked />
  } else if (me.isPending) {
```

- change the header's `{me.data.account && (` to `{!blocked && me.data.account && (`.

- [ ] **Step 4: Run everything.**

Run: `npx vitest run && npm run lint`
Expected: all pass; lint exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/api src/mocks/index.ts src/main.tsx src/test/render.tsx src/layout
git commit -m "S1-07: BlockedError + access-turned-off card; any blocked data call re-checks me

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Request-activation flow — statuses, cancel old links, 24 h, email in link; one deploy script for all portal flows

**Files:**
- Modify: `scripts/dataverse/activation_flow.json`
- Rename + modify: `scripts/dataverse/activation_flow.py` → `scripts/dataverse/portal_flows.py`
- Test: `test/flows/activation_flow.test.ts`

**Interfaces:**
- **Produces:**
  - the flow reply `{"status": "ok" | "needs_help" | "already_active"}`;
  - `python scripts/dataverse/portal_flows.py [--outlook-connection X]`, which deploys every flow in its `FLOWS` list and prints `<KEY>_FLOW_ID=<id>` per flow.

- [ ] **Step 1: Write the failing tests.**

In `test/flows/activation_flow.test.ts`, replace the test `'every Power Pages response returns status ok, and there is one per business outcome'` with:

```ts
test('each business outcome returns its status to Power Pages', () => {
  const statusOf = (name: string) => actions.find(([n]) => n === name)![1].inputs.body
  for (const name of ['Return_invalid_email', 'Return_no_match', 'Return_no_customer', 'Return_sent']) {
    expect(statusOf(name), name).toEqual({ status: 'ok' })
  }
  for (const name of ['Return_several_customers', 'Return_several_contacts', 'Return_linked_elsewhere']) {
    expect(statusOf(name), name).toEqual({ status: 'needs_help' })
  }
  expect(statusOf('Return_already_active')).toEqual({ status: 'already_active' })
})

test('a new request cancels the contact\'s earlier unused links before creating one that lasts 24 hours', () => {
  const [, list] = actions.find(([n]) => n === 'List_open_invitations')!
  expect(list.inputs.parameters.$filter).toBe(
    "_adx_invitecontact_value eq @{variables('ContactId')} and statecode eq 0 and (adx_redemptions eq null or adx_redemptions eq 0)",
  )
  const [, cancel] = actions.find(([n]) => n === 'Cancel_invitation')!
  expect(cancel.inputs.parameters).toMatchObject({ entityName: 'adx_invitations', 'item/statecode': 1, 'item/statuscode': 2 })
  const [, code] = actions.find(([n]) => n === 'Invitation_code')!
  expect(code.runAfter).toEqual({ Cancel_earlier_invitations: ['Succeeded'] })
  const [, create] = actions.find(([n]) => n === 'Create_invitation')!
  expect(create.runAfter).toEqual({ Invitation_code: ['Succeeded'] })
  expect(create.inputs.parameters['item/adx_expirydate']).toBe('@{addHours(utcNow(), 24)}')
})

test('the email links to Set password with the code and the email, and says 24 hours', () => {
  const [, mail] = actions.find(([n]) => n === 'Send_activation_email')!
  const body = mail.inputs.parameters['emailMessage/Body']
  expect(body).toContain("/activate/complete?code=@{outputs('Invitation_code')}&amp;email=@{encodeUriComponent(outputs('Email'))}")
  expect(body).toContain('This link can be used once and expires in 24 hours.')
})
```

- [ ] **Step 2: Run it.**

Run: `npx vitest run test/flows/activation_flow.test.ts`
Expected: FAIL. The statuses are all `ok`, there's no cancel step, the expiry is `addDays(…, 7)`, and the link has no email.

- [ ] **Step 3: Patch the definition** (run once; the JSON is the source of truth):

```bash
python - <<'EOF'
import io, json
p = 'scripts/dataverse/activation_flow.json'
d = json.load(open(p, encoding='utf-8'))

def walk(actions):
    for name, a in actions.items():
        yield name, a, actions
        for child in (a.get('actions'), (a.get('else') or {}).get('actions')):
            if child:
                yield from walk(child)

for name, a, _ in list(walk(d['actions'])):
    if a.get('type') == 'Response':
        a['inputs']['body'] = {'status': 'needs_help' if name in ('Return_several_customers', 'Return_several_contacts', 'Return_linked_elsewhere')
                               else 'already_active' if name == 'Return_already_active' else 'ok'}

top = d['actions']
new = {}
for name, a in top.items():
    if name == 'Invitation_code':
        new['List_open_invitations'] = {'type': 'OpenApiConnection', 'runAfter': top['Invitation_code']['runAfter'], 'inputs': {
            'host': {'connectionName': 'shared_commondataserviceforapps', 'operationId': 'ListRecords',
                     'apiId': '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'},
            'parameters': {'entityName': 'adx_invitations', '$select': 'adx_invitationid',
                           '$filter': "_adx_invitecontact_value eq @{variables('ContactId')} and statecode eq 0 and (adx_redemptions eq null or adx_redemptions eq 0)"},
            'authentication': "@parameters('$authentication')"}}
        new['Cancel_earlier_invitations'] = {'type': 'Foreach', 'runAfter': {'List_open_invitations': ['Succeeded']},
            'foreach': "@outputs('List_open_invitations')?['body/value']", 'actions': {'Cancel_invitation': {
                'type': 'OpenApiConnection', 'runAfter': {}, 'inputs': {
                    'host': {'connectionName': 'shared_commondataserviceforapps', 'operationId': 'UpdateOnlyRecord',
                             'apiId': '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'},
                    'parameters': {'entityName': 'adx_invitations', 'recordId': "@items('Cancel_earlier_invitations')?['adx_invitationid']",
                                   'item/statecode': 1, 'item/statuscode': 2},
                    'authentication': "@parameters('$authentication')"}}}}
        a['runAfter'] = {'Cancel_earlier_invitations': ['Succeeded']}
    new[name] = a
d['actions'] = new
top = d['actions']
top['Create_invitation']['inputs']['parameters']['item/adx_expirydate'] = '@{addHours(utcNow(), 24)}'
mail = top['Send_activation_email']['inputs']['parameters']
mail['emailMessage/Body'] = (mail['emailMessage/Body']
    .replace("/activate/complete?code=@{outputs('Invitation_code')}\"", "/activate/complete?code=@{outputs('Invitation_code')}&amp;email=@{encodeUriComponent(outputs('Email'))}\"")
    .replace('expires in 7 days.', 'expires in 24 hours.'))
with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write('\n')
EOF
```

- [ ] **Step 4: Generalise the deploy script.**

```bash
git mv scripts/dataverse/activation_flow.py scripts/dataverse/portal_flows.py
```

Replace the whole of `scripts/dataverse/portal_flows.py` with:

```python
"""Create or update the solution-aware Concreat Connect portal flows in ConcreatHub. Dev only. Idempotent.

Each flow's definition is the JSON file named in FLOWS (next to this file). Environment-specific values come from
the ConcreatHub environment variables at run time; the definitions hold none of them.

Usage (from the repo root):
  python scripts/dataverse/portal_flows.py [--outlook-connection <connection name>] [--only <key>]
--outlook-connection is needed only the first time, to create the chp_outlook connection reference.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from dv import Dataverse  # noqa: E402  (sets MSCRM.SolutionUniqueName: ConcreatHub)

SOLUTION_ID = 'ed4d4ea0-74bd-f111-aaad-7ced8dfe9114'
REFS = {
    'shared_commondataserviceforapps': ('chp_dataverse', 'Concreat Hub – Dataverse'),
    'shared_office365': ('chp_outlook', 'Concreat Hub – Office 365 Outlook'),
}
FLOWS = [
    # (key, name, definition file, description)
    ('ACTIVATION', 'Concreat Connect – Request activation', 'activation_flow.json',
     'Activation request from the portal: BC match, Q10, account/contact/link, pending grants, single-use invitation email. S1-03.'),
    ('CHECK_LINK', 'Concreat Connect – Check activation link', 'check_link_flow.json',
     'Tells the Set password page whether an activation link is still valid (valid | invalid). S1-03.'),
    ('PASSWORD_RESET', 'Concreat Connect – Send password reset', 'password_reset_flow.json',
     "Delivers Power Pages' password reset email as a branded Outlook email. S1-03."),
]

parser = argparse.ArgumentParser()
parser.add_argument('--outlook-connection', help='Office 365 Outlook connection name')
parser.add_argument('--only', help='deploy only this flow key, e.g. CHECK_LINK')
args = parser.parse_args()

dv = Dataverse()
here = os.path.dirname(__file__)

for api, (ref, display) in REFS.items():
    if dv.get(f"connectionreferences?$select=connectionreferenceid&$filter=connectionreferencelogicalname eq '{ref}'")['value']:
        print(f'= connection reference {ref} exists')
    elif api == 'shared_office365' and args.outlook_connection:
        dv.post('connectionreferences', {'connectionreferencelogicalname': ref, 'connectionreferencedisplayname': display,
                                         'connectorid': f'/providers/Microsoft.PowerApps/apis/{api}',
                                         'connectionid': args.outlook_connection})
        print(f'+ connection reference {ref}')
    else:
        raise SystemExit(f'connection reference {ref} is missing' +
                         (' — pass --outlook-connection <name>' if api == 'shared_office365' else ' — run grant_flow.py first'))

clientrefs = {api: {'runtimeSource': 'embedded', 'connection': {'connectionReferenceLogicalName': ref}, 'api': {'name': api}}
              for api, (ref, _) in REFS.items()}

for key, name, file, description in FLOWS:
    if args.only and key != args.only:
        continue
    path = os.path.join(here, file)
    if not os.path.exists(path):
        print(f'- {key}: {file} not written yet, skipped')
        continue
    definition = json.load(open(path, encoding='utf-8'))
    clientdata = {'properties': {'connectionReferences': clientrefs, 'definition': definition}, 'schemaVersion': '1.0.0.0'}
    found = dv.get(f"workflows?$select=workflowid&$filter=name eq '{name}' and category eq 5")['value']
    if found:
        wf = found[0]['workflowid']
        dv.patch(f'workflows({wf})', {'statecode': 0, 'statuscode': 1})  # a flow must be off to change its definition
        try:
            dv.patch(f'workflows({wf})', {'clientdata': json.dumps(clientdata)})
        except SystemExit:
            dv.patch(f'workflows({wf})', {'statecode': 1, 'statuscode': 2})  # keep the previous definition running
            print(f'! {key}: definition rejected; flow turned back on with its previous definition')
            raise
        print(f'= {key}: flow exists ({wf}), definition updated')
    else:
        entity = dv.post('workflows', {'name': name, 'category': 5, 'type': 1, 'primaryentity': 'none',
                                       'description': description, 'clientdata': json.dumps(clientdata)})
        wf = entity.split('(')[-1].rstrip(')')
        print(f'+ {key}: flow {wf}')
    # Turning the flow on (re)loads the environment variable values into it.
    dv.patch(f'workflows({wf})', {'statecode': 1, 'statuscode': 2})
    in_sol = dv.get(f"solutioncomponents?$select=objectid&$filter=objectid eq {wf} and _solutionid_value eq {SOLUTION_ID}")['value']
    print(f'  on, in ConcreatHub: {bool(in_sol)}')
    print(f'{key}_FLOW_ID={wf}')
```

- [ ] **Step 5: Run the tests and compile the script.**

Run: `npx vitest run test/flows && python -m py_compile scripts/dataverse/portal_flows.py && rm -rf scripts/dataverse/__pycache__`
Expected: PASS.

- [ ] **Step 6: Commit** (deploying happens in Task 9).

```bash
git add scripts/dataverse/activation_flow.json scripts/dataverse/portal_flows.py test/flows/activation_flow.test.ts
git commit -m "S1-03: activation flow returns ok/needs_help/already_active, cancels earlier links, 24 h expiry, email in link; portal_flows.py deploys all portal flows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: "Check activation link" flow

**Files:**
- Create: `scripts/dataverse/check_link_flow.json`
- Test: `test/flows/check_link_flow.test.ts`

**Interfaces:**
- **Produces:**
  - Power Pages trigger with one input titled `Code`;
  - reply `{"status":"valid"|"invalid"}`.

- [ ] **Step 1: Write the failing test** — `test/flows/check_link_flow.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const definition = JSON.parse(readFileSync(resolve('scripts/dataverse/check_link_flow.json'), 'utf8'))
const text = JSON.stringify(definition)
type Action = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const flat = (actions: Record<string, Action>): [string, Action][] =>
  Object.entries(actions).flatMap(([n, a]) => [[n, a] as [string, Action], ...flat(a.actions ?? {}), ...flat(a.else?.actions ?? {})])
const actions = flat(definition.actions)

test('is triggered by Power Pages with a single Code input', () => {
  const [trigger] = Object.values(definition.triggers) as Action[]
  expect([trigger.type, trigger.kind]).toEqual(['Request', 'PowerPages'])
  expect(Object.values(trigger.inputs.schema.properties).map((p) => (p as Action).title)).toEqual(['Code'])
})

test('looks the code up among active invitations, with quotes doubled', () => {
  const [, list] = actions.find(([n]) => n === 'List_invitation')!
  expect(list.inputs.parameters.entityName).toBe('adx_invitations')
  expect(list.inputs.parameters.$filter).toBe("adx_invitationcode eq '@{replace(outputs('Code'), '''', '''''')}' and statecode eq 0")
})

test('answers only valid or invalid, valid only when unexpired with redemptions left', () => {
  const responses = actions.filter(([, a]) => a.type === 'Response').map(([, a]) => a.inputs.body.status)
  expect(responses.sort()).toEqual(['invalid', 'valid'])
  expect(text).toContain('adx_expirydate')
  expect(text).toContain('adx_maximumredemptions')
})

test('holds no environment-specific values', () => {
  expect(text).not.toMatch(/f44e98b4|d2e4496e|188fc244|chp-portal-dev|automations365/)
})
```

- [ ] **Step 2: Run it.**

Run: `npx vitest run test/flows/check_link_flow.test.ts`
Expected: FAIL (ENOENT).

- [ ] **Step 3: Write the definition:**

```bash
python - <<'EOF'
import io, json
DV = {'connectionName': 'shared_commondataserviceforapps', 'operationId': 'ListRecords',
      'apiId': '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'}
SCHEMA = {'type': 'object', 'properties': {'status': {'title': 'status', 'x-ms-dynamically-added': True, 'type': 'string'}}}
FIRST = "first(outputs('List_invitation')?['body/value'])"
respond = lambda status: {'type': 'Response', 'kind': 'PowerPages', 'runAfter': {}, 'inputs': {'statusCode': 200, 'body': {'status': status}, 'schema': SCHEMA}}
d = {
    '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
    'contentVersion': '1.0.0.0',
    'parameters': {'$connections': {'defaultValue': {}, 'type': 'Object'}, '$authentication': {'defaultValue': {}, 'type': 'SecureObject'}},
    'triggers': {'manual': {'type': 'Request', 'kind': 'PowerPages', 'inputs': {'schema': {'type': 'object', 'properties': {'text': {
        'title': 'Code', 'type': 'string', 'x-ms-dynamically-added': True, 'description': 'Code from the activation link', 'x-ms-content-hint': 'TEXT'}},
        'required': ['text']}}}},
    'actions': {
        'Code': {'type': 'Compose', 'runAfter': {}, 'inputs': "@trim(coalesce(triggerBody()?['text'], ''))"},
        'List_invitation': {'type': 'OpenApiConnection', 'runAfter': {'Code': ['Succeeded']}, 'inputs': {'host': DV, 'parameters': {
            'entityName': 'adx_invitations', '$select': 'adx_expirydate,adx_redemptions,adx_maximumredemptions',
            '$filter': "adx_invitationcode eq '@{replace(outputs('Code'), '''', '''''')}' and statecode eq 0", '$top': 1},
            'authentication': "@parameters('$authentication')"}},
        'Is_valid': {'type': 'If', 'runAfter': {'List_invitation': ['Succeeded']}, 'expression': {'equals': [
            f"@and(not(equals(outputs('Code'), '')), greater(length(outputs('List_invitation')?['body/value']), 0), "
            f"greater(ticks(coalesce({FIRST}?['adx_expirydate'], '9999-12-31T00:00:00Z')), ticks(utcNow())), "
            f"less(coalesce({FIRST}?['adx_redemptions'], 0), coalesce({FIRST}?['adx_maximumredemptions'], 1)))", True]},
            'actions': {'Return_valid': respond('valid')}, 'else': {'actions': {'Return_invalid': respond('invalid')}}},
    },
    'outputs': {},
}
with io.open('scripts/dataverse/check_link_flow.json', 'w', encoding='utf-8', newline='\n') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write('\n')
EOF
```

- [ ] **Step 4: Run the tests.**

Run: `npx vitest run test/flows`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/dataverse/check_link_flow.json test/flows/check_link_flow.test.ts
git commit -m "S1-03: Check activation link flow (valid | invalid) for the Set password page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: "Send password reset" flow

**Files:**
- Create: `scripts/dataverse/password_reset_flow.json`
- Test: `test/flows/password_reset_flow.test.ts`

**Interfaces:**
- **Consumes:** the Dataverse email Power Pages' "Send Password Reset To Contact" process creates. Its subject contains "Password Reset", it's regarding the contact, and its body has a link containing `ResetPassword?`.
- **Produces:** an email "Reset your Concreat Connect password" with a link to `{chp_SiteUrl}/reset-password?<original UserId & Code query>&email=<contact email>`. The Dataverse email is set to Canceled.

- [ ] **Step 1: Write the failing test** — `test/flows/password_reset_flow.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const definition = JSON.parse(readFileSync(resolve('scripts/dataverse/password_reset_flow.json'), 'utf8'))
const text = JSON.stringify(definition)
type Action = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const flat = (actions: Record<string, Action>): [string, Action][] =>
  Object.entries(actions).flatMap(([n, a]) => [[n, a] as [string, Action], ...flat(a.actions ?? {}), ...flat(a.else?.actions ?? {})])
const actions = flat(definition.actions)
const action = (name: string) => actions.find(([n]) => n === name)![1]

test('runs when Dataverse adds a password reset email', () => {
  const [trigger] = Object.values(definition.triggers) as Action[]
  expect(trigger.inputs.parameters).toMatchObject({
    'subscriptionRequest/message': 1,
    'subscriptionRequest/entityname': 'email',
    'subscriptionRequest/filterexpression': "contains(subject,'Password Reset')",
  })
})

test("sends the branded email to the contact's address with our reset link", () => {
  const mail = action('Send_reset_email').inputs.parameters
  expect(mail['emailMessage/To']).toBe("@{outputs('Get_contact')?['body/emailaddress1']}")
  expect(mail['emailMessage/Subject']).toBe('Reset your Concreat Connect password')
  expect(mail['emailMessage/Body']).toContain("/reset-password?@{outputs('Reset_query')}&amp;email=@{encodeUriComponent(outputs('Get_contact')?['body/emailaddress1'])}")
  expect(mail['emailMessage/Body']).toContain('This link expires in 1 hour.')
})

test('fails the run (sends nothing) when the reset link is missing', () => {
  expect(action('Has_reset_link').else.actions.Stop_no_link).toMatchObject({ type: 'Terminate', inputs: { runStatus: 'Failed' } })
})

test('cancels the Dataverse email so nothing sends it again', () => {
  expect(action('Cancel_dataverse_email').inputs.parameters).toMatchObject({ entityName: 'emails', 'item/statecode': 2, 'item/statuscode': 5 })
})

test('reads the site URL from its environment variable', () => {
  expect(Object.values(definition.parameters).map((p) => (p as Action).metadata?.schemaName).filter(Boolean)).toEqual(['chp_SiteUrl'])
  expect(text).not.toMatch(/f44e98b4|chp-portal-dev|automations365/)
})
```

- [ ] **Step 2: Run it.**

Run: `npx vitest run test/flows/password_reset_flow.test.ts`
Expected: FAIL (ENOENT).

- [ ] **Step 3: Write the definition:**

```bash
python - <<'EOF'
import io, json
def dv(op, params):
    return {'type': 'OpenApiConnection', 'inputs': {'host': {'connectionName': 'shared_commondataserviceforapps', 'operationId': op,
            'apiId': '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'}, 'parameters': params,
            'authentication': "@parameters('$authentication')"}}
SITE = "parameters('Site URL (chp_SiteUrl)')"
EMAIL = "outputs('Get_contact')?['body/emailaddress1']"
BODY = (
    "<p>Hello @{outputs('Get_contact')?['body/fullname']},</p>"
    '<p>We received a request to reset your Concreat Connect password. Use the link below to choose a new one.</p>'
    f"<p><a href=\"@{{{SITE}}}/reset-password?@{{outputs('Reset_query')}}&amp;email=@{{encodeUriComponent({EMAIL})}}\" "
    'style="display:inline-block;padding:10px 18px;background:#1d2b5f;color:#ffffff;text-decoration:none;border-radius:6px">'
    'Reset your password</a></p>'
    '<p>This link expires in 1 hour.</p>'
    "<p>If you didn't ask for this, you can ignore this email.</p>"
    '<p>Need assistance? Contact Concreat Customer Service Center at (02) 8849-3600.</p>'
)
actions = {
    'Get_contact': dv('GetItem', {'entityName': 'contacts', 'recordId': "@triggerOutputs()?['body/_regardingobjectid_value']",
                                  '$select': 'emailaddress1,fullname'}),
    'Has_reset_link': {'type': 'If', 'expression': {'equals': [
        "@contains(coalesce(triggerOutputs()?['body/description'], ''), 'ResetPassword?')", True]},
        'actions': {
            # Query of the built-in link (UserId=…&Code=…), cut at the closing quote; HTML-escaped & restored.
            'Reset_query': {'type': 'Compose', 'runAfter': {}, 'inputs':
                "@replace(first(split(last(split(triggerOutputs()?['body/description'], 'ResetPassword?')), '\"')), '&amp;', '&')"},
            'Send_reset_email': {'type': 'OpenApiConnection', 'runAfter': {'Reset_query': ['Succeeded']}, 'inputs': {
                'host': {'connectionName': 'shared_office365', 'operationId': 'SendEmailV2', 'apiId': '/providers/Microsoft.PowerApps/apis/shared_office365'},
                'parameters': {'emailMessage/To': f'@{{{EMAIL}}}', 'emailMessage/Subject': 'Reset your Concreat Connect password',
                               'emailMessage/Body': BODY, 'emailMessage/Importance': 'Normal'},
                'authentication': "@parameters('$authentication')"}},
            'Cancel_dataverse_email': dv('UpdateOnlyRecord', {'entityName': 'emails', 'recordId': "@triggerOutputs()?['body/activityid']",
                                                              'item/statecode': 2, 'item/statuscode': 5}),
        },
        'else': {'actions': {'Stop_no_link': {'type': 'Terminate', 'runAfter': {},
                                              'inputs': {'runStatus': 'Failed', 'runError': {'message': 'Reset link not found in the password reset email'}}}}}},
}
actions['Get_contact']['runAfter'] = {}
actions['Has_reset_link']['runAfter'] = {'Get_contact': ['Succeeded']}
actions['Has_reset_link']['actions']['Cancel_dataverse_email']['runAfter'] = {'Send_reset_email': ['Succeeded']}
d = {
    '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
    'contentVersion': '1.0.0.0',
    'parameters': {'$connections': {'defaultValue': {}, 'type': 'Object'}, '$authentication': {'defaultValue': {}, 'type': 'SecureObject'},
                   'Site URL (chp_SiteUrl)': {'defaultValue': '', 'type': 'String', 'metadata': {'schemaName': 'chp_SiteUrl', 'description': 'Site URL'}}},
    'triggers': {'When_a_password_reset_email_is_added': {'type': 'OpenApiConnectionWebhook', 'inputs': {
        'host': {'connectionName': 'shared_commondataserviceforapps', 'operationId': 'SubscribeWebhookTrigger',
                 'apiId': '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'},
        'parameters': {'subscriptionRequest/message': 1, 'subscriptionRequest/entityname': 'email', 'subscriptionRequest/scope': 4,
                       'subscriptionRequest/filterexpression': "contains(subject,'Password Reset')"},
        'authentication': "@parameters('$authentication')"}}},
    'actions': actions,
    'outputs': {},
}
with io.open('scripts/dataverse/password_reset_flow.json', 'w', encoding='utf-8', newline='\n') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write('\n')
EOF
```

- [ ] **Step 4: Run the tests.**

Run: `npx vitest run test/flows`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/dataverse/password_reset_flow.json test/flows/password_reset_flow.test.ts
git commit -m "S1-03: Send password reset flow (branded Outlook email, link to /reset-password, Dataverse email canceled)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: App — activation outcomes, link check, pre-filled email

**Files:**
- Modify: `src/auth/session.ts`, `src/auth/session.test.ts`, `src/modules/signin/Activate.tsx`, `src/modules/signin/Activate.test.tsx`, `src/modules/signin/SetPassword.tsx`, `src/modules/signin/SetPassword.test.tsx`

**Interfaces:**
- **Produces:**
  - `type ActivationStatus = 'ok' | 'needs_help' | 'already_active'`;
  - `requestActivation(email): Promise<ActivationStatus>`;
  - `checkActivationLink(code): Promise<'valid' | 'invalid'>`;
  - a private `triggerFlow(flowId, input)` in session.ts.

- [ ] **Step 1: Write the failing tests.**

In `src/auth/session.test.ts`:
- **Deployed-site block:** replace `'requestActivation posts the email to the flow trigger with CSRF headers'` with:

```ts
  test('requestActivation posts the email to the flow trigger with CSRF headers and returns its status', async () => {
    vi.stubEnv('VITE_ACTIVATION_FLOW_ID', 'flow-1')
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response('{"status":"already_active"}'),
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await requestActivation('jd@x.ph')).toBe('already_active')

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/_api/cloudflow/v1.0/trigger/flow-1')
    expect(JSON.parse(init!.body as string)).toEqual({ eventData: JSON.stringify({ Email: 'jd@x.ph' }) })
    const headers = new Headers(init!.headers)
    expect(headers.get('__RequestVerificationToken')).toBe('tok123')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
  })

  test.each([['{}'], ['{"status":"something-new"}'], ['not json']])('an unknown reply %s counts as ok', async (reply) => {
    vi.stubEnv('VITE_ACTIVATION_FLOW_ID', 'flow-1')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response(reply))))
    expect(await requestActivation('jd@x.ph')).toBe('ok')
  })

  test('checkActivationLink posts the code and returns valid or invalid', async () => {
    vi.stubEnv('VITE_CHECK_LINK_FLOW_ID', 'flow-2')
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response('{"status":"invalid"}'),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await checkActivationLink('abc')).toBe('invalid')
    expect(fetchMock.mock.calls[1][0]).toBe('/_api/cloudflow/v1.0/trigger/flow-2')
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ eventData: JSON.stringify({ Code: 'abc' }) })
  })

  test('checkActivationLink fails when the check flow is unavailable', async () => {
    vi.stubEnv('VITE_CHECK_LINK_FLOW_ID', 'flow-2')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response('', { status: 502 }))))
    await expect(checkActivationLink('abc')).rejects.toThrow()
  })
```

- **Dev-server block:** add:

```ts
  test('requestActivation simulates each outcome by email', async () => {
    expect(await requestActivation('multi@test.ph')).toBe('needs_help')
    expect(await requestActivation('active@test.ph')).toBe('already_active')
    expect(await requestActivation('jd@x.ph')).toBe('ok')
  })
```

- Add `checkActivationLink` to the import list.

Replace `src/modules/signin/Activate.test.tsx`'s second test with these, keeping the other two:

```ts
test('ok shows the neutral confirmation with the 24-hour expiry', async () => {
  vi.mocked(requestActivation).mockResolvedValue('ok')
  renderApp(<Activate />, { route: '/activate' })
  await submit('jd@x.ph')
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(screen.getByText('jd@x.ph')).toBeInTheDocument()
  expect(screen.getByText(/The link can be used once and expires in 24 hours\./)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/')
  expect(requestActivation).toHaveBeenCalledWith('jd@x.ph')
})

test('needs_help asks the customer to contact the service center', async () => {
  vi.mocked(requestActivation).mockResolvedValue('needs_help')
  renderApp(<Activate />, { route: '/activate' })
  await submit('jd@x.ph')
  expect(await screen.findByRole('heading', { name: "We couldn't activate this email automatically" })).toBeInTheDocument()
  expect(
    screen.getByText(
      'This email address is linked to more than one Concreat customer account, so it needs to be set up by our team. Please contact the Concreat Customer Service Center at (02) 8849-3600.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/')
})

test('already_active offers sign in and password reset', async () => {
  vi.mocked(requestActivation).mockResolvedValue('already_active')
  renderApp(<Activate />, { route: '/activate' })
  await submit('jd@x.ph')
  expect(await screen.findByRole('heading', { name: 'Your account is already active' })).toBeInTheDocument()
  expect(screen.getByText("Sign in with your email and password. If you've forgotten your password, you can reset it.")).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('link', { name: 'Reset password' })).toHaveAttribute('href', '/forgot-password')
})
```

In `src/modules/signin/SetPassword.test.tsx`, replace everything above the first `test(` with:

```ts
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { checkActivationLink, InvalidInvitationError, redeemInvitation } from '@/auth/session'
import { renderApp } from '@/test/render'
import { SetPassword } from './SetPassword'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  redeemInvitation: vi.fn(),
  checkActivationLink: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(checkActivationLink).mockResolvedValue('valid')
})

const ROUTE = '/activate/complete?code=abc123&email=jd%40x.ph'

// The email comes from the link (read-only); wait for the link check before typing.
async function fill(password: string, confirm = password) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Password'), password)
  await user.type(screen.getByLabelText('Confirm password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Activate account' }))
}
```

In the test `'both password fields have their own show/hide button'`, change its first lines to:

```ts
  const user = userEvent.setup()
  renderApp(<SetPassword />, { route: ROUTE })
  await screen.findByLabelText('Password')
  const [first, second] = screen.getAllByRole('button', { name: 'Show password' })
```

(and make the test `async`). The other existing tests already use `fill` and `ROUTE` and stay as they are.

- Add:

```ts
test('a used or expired link shows only the expired card, never the form', async () => {
  vi.mocked(checkActivationLink).mockResolvedValue('invalid')
  renderApp(<SetPassword />, { route: ROUTE })
  expect(screen.getByRole('status')).toHaveTextContent('Checking your link…')
  expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
  expect(screen.getByText('This activation link is invalid, has already been used, or has expired.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  expect(checkActivationLink).toHaveBeenCalledWith('abc123')
})

test('a valid link shows the email from the link, read-only', async () => {
  renderApp(<SetPassword />, { route: ROUTE })
  const email = await screen.findByLabelText('Email address')
  expect(email).toHaveValue('jd@x.ph')
  expect(email).toHaveAttribute('readonly')
})

test('an older link without an email keeps the email field editable', async () => {
  renderApp(<SetPassword />, { route: '/activate/complete?code=abc123' })
  const email = await screen.findByLabelText('Email address')
  expect(email).toHaveValue('')
  expect(email).not.toHaveAttribute('readonly')
})

test('if the link check fails, the form still shows (Power Pages rejects a used code on submit)', async () => {
  vi.mocked(checkActivationLink).mockRejectedValue(new Error('flow down'))
  renderApp(<SetPassword />, { route: ROUTE })
  expect(await screen.findByLabelText('Password')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run them.**

Run: `npx vitest run src/auth src/modules/signin`
Expected: FAIL.

- [ ] **Step 3: Implement.**

In `src/auth/session.ts`, replace `requestActivation` with:

```ts
export type ActivationStatus = 'ok' | 'needs_help' | 'already_active'
const ACTIVATION_STATUSES: ActivationStatus[] = ['ok', 'needs_help', 'already_active']

/** Posts one input to a Power Pages cloud flow and returns its reply's `status` (undefined if absent). */
async function triggerFlow(flowId: string | undefined, input: Record<string, string>): Promise<string | undefined> {
  if (!flowId) throw new Error(ACTIVATION_SEND_FAILED)
  const response = await send(`/_api/cloudflow/v1.0/trigger/${flowId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      __RequestVerificationToken: await fetchAntiForgeryToken(),
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'same-origin',
    // The eventData key must equal the flow trigger input's title.
    body: JSON.stringify({ eventData: JSON.stringify(input) }),
  })
  if (!response.ok) throw new Error(ACTIVATION_SEND_FAILED)
  const reply = (await response.json().catch(() => undefined)) as { status?: unknown } | undefined
  return typeof reply?.status === 'string' ? reply.status : undefined
}

/**
 * Triggers the "Request activation" cloud flow. Unknown emails get "ok" like a sent invitation, so the
 * page can't be used to discover which emails belong to a customer (spec D "middle ground").
 */
export async function requestActivation(email: string): Promise<ActivationStatus> {
  if (import.meta.env.DEV) {
    await new Promise((resolve) => setTimeout(resolve, 600))
    const address = email.trim().toLowerCase()
    return address === 'multi@test.ph' ? 'needs_help' : address === 'active@test.ph' ? 'already_active' : 'ok'
  }
  const status = await triggerFlow(import.meta.env.VITE_ACTIVATION_FLOW_ID, { Email: email })
  return ACTIVATION_STATUSES.includes(status as ActivationStatus) ? (status as ActivationStatus) : 'ok'
}

/** Asks the "Check activation link" flow whether an activation code can still be used. */
export async function checkActivationLink(code: string): Promise<'valid' | 'invalid'> {
  if (import.meta.env.DEV) return code === 'expired' ? 'invalid' : 'valid'
  return (await triggerFlow(import.meta.env.VITE_CHECK_LINK_FLOW_ID, { Code: code })) === 'valid' ? 'valid' : 'invalid'
}
```

In `src/modules/signin/Activate.tsx`:
- import `type ActivationStatus` from `@/auth/session`;
- replace `const [sentTo, setSentTo] = useState<string>()` with `const [result, setResult] = useState<{ status: ActivationStatus; email: string }>()`;
- in `onSubmit` use `setResult({ status: await requestActivation(email), email })`;
- replace the `if (sentTo) { … }` block with:

```tsx
  if (result?.status === 'needs_help') {
    return (
      <AuthLayout>
        <AuthCardHeader title="We couldn't activate this email automatically" />
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          This email address is linked to more than one Concreat customer account, so it needs to be set up by our team. Please contact the
          Concreat Customer Service Center at (02) 8849-3600.
        </p>
        <p className="mt-[18px] text-center text-[13px]">
          <Link to="/" className="font-semibold text-primary">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  if (result?.status === 'already_active') {
    return (
      <AuthLayout>
        <AuthCardHeader title="Your account is already active" />
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          Sign in with your email and password. If you've forgotten your password, you can reset it.
        </p>
        <Button asChild className={cn(brandButton, 'mt-6')}>
          <Link to="/">Sign in</Link>
        </Button>
        <p className="mt-[18px] text-center text-[13px]">
          <Link to="/forgot-password" className="font-semibold text-primary">
            Reset password
          </Link>
        </p>
      </AuthLayout>
    )
  }

  if (result) {
    return (
      <AuthLayout>
        <AuthCardHeader title="Check your email" />
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          If <strong className="text-foreground">{result.email}</strong> is registered to a Concreat Holdings customer account, we've sent an
          activation link to it. The link can be used once and expires in 24 hours.
        </p>
        <p className="mt-3.5 text-center text-[12.5px] leading-normal text-muted-foreground">
          Didn't get it? Check your spam or junk folder, or contact the <strong>Concreat Customer Service Center</strong> at{' '}
          <strong>(02) 8849-3600</strong>.
        </p>
        <p className="mt-[18px] text-center text-[13px]">
          <Link to="/" className="font-semibold text-primary">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }
```

In `src/modules/signin/SetPassword.tsx`:
- import `useQuery` from `@tanstack/react-query` and `checkActivationLink`;
- after `const code = params.get('code')` add:

```ts
  const linkEmail = params.get('email') ?? ''
  // Opening a used, expired or cancelled link shows only the expired card (spec D). If the check itself
  // fails, the form shows and Power Pages still rejects a used code on submit.
  const link = useQuery({ queryKey: ['activation-link', code], queryFn: () => checkActivationLink(code!), enabled: !!code, retry: false })
```

- change `defaultValues: { email: '', …` to `defaultValues: { email: linkEmail, password: '', confirm: '' }`;
- change `if (expired) {` to `if (expired || link.data === 'invalid') {`;
- before the final `return`, add:

```tsx
  if (link.isPending) {
    return (
      <AuthLayout>
        <p role="status" className="text-center text-[13px] text-muted-foreground">
          Checking your link…
        </p>
      </AuthLayout>
    )
  }
```

- on the email `<Input>`, add `readOnly={!!linkEmail}`.

- [ ] **Step 4: Run everything.**

Run: `npx vitest run && npm run lint`
Expected: all pass; lint exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/auth src/modules/signin/Activate.tsx src/modules/signin/Activate.test.tsx src/modules/signin/SetPassword.tsx src/modules/signin/SetPassword.test.tsx
git commit -m "S1-03: Activate shows ok / needs_help / already_active; Set password checks the link first and pre-fills the email

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: App — Forgot password and Reset password screens

**Files:**
- Create: `src/modules/signin/passwordPolicy.ts`, `src/modules/signin/ForgotPassword.tsx`, `src/modules/signin/ForgotPassword.test.tsx`, `src/modules/signin/ResetPassword.tsx`, `src/modules/signin/ResetPassword.test.tsx`
- Modify: `src/auth/session.ts`, `src/auth/session.test.ts`, `src/modules/signin/SetPassword.tsx` (use `passwordPolicy`), `src/modules/signin/SignIn.tsx`, `src/modules/signin/SignIn.test.tsx`, `src/App.tsx`

**Interfaces:**
- **Produces:**
  - `requestPasswordReset(email): Promise<void>`;
  - `resetPassword(userId, code, password, confirm): Promise<void>`;
  - `class InvalidResetLinkError`;
  - `passwordField`, `PASSWORD_HINT`;
  - routes `/forgot-password` and `/reset-password`.

- [ ] **Step 1: Write the failing tests.**

Add to `src/auth/session.test.ts`:
- deployed-site block:

```ts
  test('requestPasswordReset posts the email to the built-in ForgotPassword form', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => (url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response('')))
    vi.stubGlobal('fetch', fetchMock)
    await requestPasswordReset('jd@x.ph')
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/Account/Login/ForgotPassword')
    const body = init!.body as URLSearchParams
    expect(body.get('Email')).toBe('jd@x.ph')
    expect(body.get('__RequestVerificationToken')).toBe('tok123')
  })

  test('resetPassword posts UserId, Code and both passwords, and succeeds on the redirect', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : ({ redirected: true, url: 'https://s/Account/Login/ResetPasswordConfirmation', text: async () => '' } as Response),
    )
    vi.stubGlobal('fetch', fetchMock)
    await resetPassword('u-1', 'c+1', 'Abcdefg1', 'Abcdefg1')
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/Account/Login/ResetPassword')
    const body = init!.body as URLSearchParams
    expect([body.get('UserId'), body.get('Code'), body.get('Password'), body.get('ConfirmPassword')]).toEqual(['u-1', 'c+1', 'Abcdefg1', 'Abcdefg1'])
  })

  test('resetPassword maps "Invalid token." to InvalidResetLinkError', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/_layout/tokenhtml'
        ? new Response(TOKEN_PAGE)
        : ({ redirected: false, url: 'https://s/Account/Login/ResetPassword', text: async () => '<div class="validation-summary-errors"><ul><li>Invalid token.</li></ul></div>' } as Response),
    ))
    await expect(resetPassword('u', 'c', 'Abcdefg1', 'Abcdefg1')).rejects.toBeInstanceOf(InvalidResetLinkError)
  })
```

- add `requestPasswordReset`, `resetPassword` and `InvalidResetLinkError` to the import list.

`src/modules/signin/ForgotPassword.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { requestPasswordReset } from '@/auth/session'
import { renderApp } from '@/test/render'
import { ForgotPassword } from './ForgotPassword'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  requestPasswordReset: vi.fn(),
}))

test('sends the reset link and shows the neutral confirmation', async () => {
  vi.mocked(requestPasswordReset).mockResolvedValue()
  const user = userEvent.setup()
  renderApp(<ForgotPassword />, { route: '/forgot-password' })
  expect(document.title).toBe('Reset your password — Concreat Connect')
  await user.type(screen.getByLabelText('Email address'), 'jd@x.ph')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(
    screen.getByText("If this email has an active Concreat Connect account, we've sent a link to reset your password. The link expires in 1 hour."),
  ).toBeInTheDocument()
  expect(requestPasswordReset).toHaveBeenCalledWith('jd@x.ph')
})

test('validates the email first', async () => {
  const user = userEvent.setup()
  renderApp(<ForgotPassword />, { route: '/forgot-password' })
  await user.type(screen.getByLabelText('Email address'), 'nope')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  expect(requestPasswordReset).not.toHaveBeenCalled()
})

test('a send failure keeps the form and explains', async () => {
  vi.mocked(requestPasswordReset).mockRejectedValue(new Error("We couldn't reach the sign-in service. Please try again."))
  const user = userEvent.setup()
  renderApp(<ForgotPassword />, { route: '/forgot-password' })
  await user.type(screen.getByLabelText('Email address'), 'jd@x.ph')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't reach the sign-in service. Please try again.")
})
```

`src/modules/signin/ResetPassword.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvalidResetLinkError, resetPassword } from '@/auth/session'
import { renderApp } from '@/test/render'
import { ResetPassword } from './ResetPassword'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  resetPassword: vi.fn(),
}))

const ROUTE = '/reset-password?UserId=u-1&Code=c%2B1&email=jd%40x.ph'

async function fill(password: string, confirm = password) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New password'), password)
  await user.type(screen.getByLabelText('Confirm password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Save password' }))
}

test('shows the email from the link read-only and saves the new password', async () => {
  vi.mocked(resetPassword).mockResolvedValue()
  renderApp(<ResetPassword />, { route: ROUTE })
  expect(document.title).toBe('Set a new password — Concreat Connect')
  expect(screen.getByLabelText('Email address')).toHaveValue('jd@x.ph')
  expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly')
  await fill('Abcdefg1')
  await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('u-1', 'c+1', 'Abcdefg1', 'Abcdefg1'))
  expect(await screen.findByRole('heading', { name: 'Your password has been reset' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/')
})

test('applies the password policy before posting', async () => {
  renderApp(<ResetPassword />, { route: ROUTE })
  await fill('Ab1!')
  expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
  expect(resetPassword).not.toHaveBeenCalled()
})

test('a used or expired reset link shows the expired card with a way to request a new one', async () => {
  vi.mocked(resetPassword).mockRejectedValue(new InvalidResetLinkError())
  renderApp(<ResetPassword />, { route: ROUTE })
  await fill('Abcdefg1')
  expect(await screen.findByText('This reset link is invalid or has expired.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
})

test('a link without UserId or Code shows the expired card straight away', () => {
  renderApp(<ResetPassword />, { route: '/reset-password' })
  expect(screen.getByText('This reset link is invalid or has expired.')).toBeInTheDocument()
})
```

In `src/modules/signin/SignIn.test.tsx`, change the Forgot password expectation to `toHaveAttribute('href', '/forgot-password')`.

- [ ] **Step 2: Run them.**

Run: `npx vitest run src/auth src/modules/signin`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/modules/signin/passwordPolicy.ts`:

```ts
import { z } from 'zod'

// Mirrors Power Pages' default policy (PasswordValidator/EnforcePasswordPolicy = true, RequiredLength = 8).
// If those site settings change, change this and the hint together.
const KINDS = [/\p{Lu}/u, /\p{Ll}/u, /\p{Nd}/u, /[^\p{L}\p{N}]/u]
const hasThreeKinds = (password: string) => KINDS.filter((kind) => kind.test(password)).length >= 3

export const passwordField = z
  .string()
  .min(1, 'Enter a password.')
  .min(8, 'Use at least 8 characters.')
  .refine(hasThreeKinds, 'Use at least three of: uppercase letters, lowercase letters, numbers, symbols.')

export const PASSWORD_HINT = 'At least 8 characters, using three of these: uppercase letters, lowercase letters, numbers, symbols.'
```

In `src/modules/signin/SetPassword.tsx`:
- delete `KINDS` and `hasThreeKinds` (and their comment);
- use `password: passwordField` in the schema;
- use `<FieldDescription>{PASSWORD_HINT}</FieldDescription>` for the password hint;
- import both from `./passwordPolicy`.

In `src/auth/session.ts`, add:

```ts
export class InvalidResetLinkError extends Error {
  constructor() {
    super('This reset link is invalid or has expired.')
    this.name = 'InvalidResetLinkError'
  }
}

/** Starts Power Pages' password reset. The reply is neutral whether or not the email has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  if (import.meta.env.DEV) {
    await new Promise((resolve) => setTimeout(resolve, 600))
    return
  }
  const response = await send('/Account/Login/ForgotPassword', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'same-origin',
    body: new URLSearchParams({ __RequestVerificationToken: await fetchAntiForgeryToken(), Email: email }),
  })
  if (!response.ok) throw new Error(SERVICE_UNREACHABLE)
}

/** Completes a reset from the emailed link. Success redirects; failure re-renders the built-in form with errors. */
export async function resetPassword(userId: string, code: string, password: string, confirmPassword: string): Promise<void> {
  if (import.meta.env.DEV) {
    if (code === 'expired') throw new InvalidResetLinkError()
    return
  }
  const response = await send('/Account/Login/ResetPassword', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'same-origin',
    body: new URLSearchParams({
      __RequestVerificationToken: await fetchAntiForgeryToken(),
      UserId: userId,
      Code: code,
      Password: password,
      ConfirmPassword: confirmPassword,
    }),
  })
  if (response.redirected) return
  const errors = parseServerErrors(await response.text())
  if (errors.length === 0 || errors.some((message) => /token/i.test(message))) throw new InvalidResetLinkError()
  throw new Error(errors.join(' '))
}
```

`src/modules/signin/ForgotPassword.tsx`:

```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { requestPasswordReset } from '@/auth/session'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { Field, FieldError, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { AuthCardHeader, AuthLayout, brandButton, FormAlert, inputClass, labelClass, SupportLine } from './AuthLayout'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
})
type Values = z.infer<typeof schema>

export function ForgotPassword() {
  usePageTitle('Reset your password')
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailure(undefined)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "We couldn't reach the sign-in service. Please try again.")
    }
  })

  if (sent) {
    return (
      <AuthLayout>
        <AuthCardHeader title="Check your email" />
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          If this email has an active Concreat Connect account, we've sent a link to reset your password. The link expires in 1 hour.
        </p>
        <p className="mt-[18px] text-center text-[13px]">
          <Link to="/" className="font-semibold text-primary">
            Back to sign in
          </Link>
        </p>
        <SupportLine />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCardHeader title="Reset your password" sub="Enter your email address and we'll send you a link to set a new password." />
      <form noValidate onSubmit={onSubmit}>
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="forgot-email" className={labelClass}>
            Email address
          </FieldLabel>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            className={inputClass}
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        {failure && <FormAlert>{failure}</FormAlert>}
        <Button type="submit" disabled={isSubmitting} className={cn(brandButton, 'mt-5')}>
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className="mt-[18px] text-center text-[13px]">
        <Link to="/" className="font-semibold text-primary">
          Back to sign in
        </Link>
      </p>
      <SupportLine />
    </AuthLayout>
  )
}
```

`src/modules/signin/ResetPassword.tsx`:

```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { InvalidResetLinkError, resetPassword } from '@/auth/session'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { PasswordInput } from '@/ui/PasswordInput'
import { AuthCardHeader, AuthLayout, brandButton, FormAlert, inputClass, labelClass, SupportLine } from './AuthLayout'
import { PASSWORD_HINT, passwordField } from './passwordPolicy'

const schema = z
  .object({ password: passwordField, confirm: z.string() })
  .refine((values) => values.confirm === values.password, { message: "Passwords don't match.", path: ['confirm'] })
type Values = z.infer<typeof schema>

export function ResetPassword() {
  usePageTitle('Set a new password')
  const [params] = useSearchParams()
  // Power Pages' reset link uses UserId and Code; the flow appends our email.
  const userId = params.get('UserId')
  const code = params.get('Code')
  const email = params.get('email') ?? ''
  const [state, setState] = useState<'form' | 'done' | 'expired'>(userId && code ? 'form' : 'expired')
  const [serverError, setServerError] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } })

  const onSubmit = handleSubmit(async ({ password, confirm }) => {
    setServerError(undefined)
    try {
      await resetPassword(userId!, code!, password, confirm)
      setState('done')
    } catch (error) {
      if (error instanceof InvalidResetLinkError) setState('expired')
      else setServerError(error instanceof Error && error.message ? error.message : "We couldn't save your password. Please try again.")
    }
  })

  if (state === 'done') {
    return (
      <AuthLayout>
        <AuthCardHeader title="Your password has been reset" sub="Sign in with your email and your new password." />
        <Button asChild className={cn(brandButton, 'mt-2')}>
          <Link to="/">Sign in</Link>
        </Button>
        <SupportLine />
      </AuthLayout>
    )
  }

  if (state === 'expired') {
    return (
      <AuthLayout>
        <AuthCardHeader title="This link has expired" />
        <p className="text-center text-[13px] text-muted-foreground">This reset link is invalid or has expired.</p>
        <Button asChild className={cn(brandButton, 'mt-6')}>
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
        <SupportLine />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCardHeader title="Set a new password" sub="Choose a new password for your Concreat Connect account." />
      <form noValidate onSubmit={onSubmit}>
        <FieldGroup className="gap-[18px]">
          <Field>
            <FieldLabel htmlFor="reset-email" className={labelClass}>
              Email address
            </FieldLabel>
            <Input id="reset-email" type="email" value={email} readOnly className={inputClass} />
          </Field>
          <Field data-invalid={errors.password ? true : undefined}>
            <FieldLabel htmlFor="reset-password" className={labelClass}>
              New password
            </FieldLabel>
            <PasswordInput id="reset-password" autoComplete="new-password" className={inputClass} aria-invalid={!!errors.password} {...register('password')} />
            <FieldDescription>{PASSWORD_HINT}</FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={errors.confirm ? true : undefined}>
            <FieldLabel htmlFor="reset-confirm" className={labelClass}>
              Confirm password
            </FieldLabel>
            <PasswordInput id="reset-confirm" autoComplete="new-password" className={inputClass} aria-invalid={!!errors.confirm} {...register('confirm')} />
            <FieldError errors={[errors.confirm]} />
          </Field>
        </FieldGroup>
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Button type="submit" disabled={isSubmitting} className={cn(brandButton, 'mt-5')}>
          {isSubmitting ? 'Saving…' : 'Save password'}
        </Button>
      </form>
      <SupportLine />
    </AuthLayout>
  )
}
```

In `src/modules/signin/SignIn.tsx`:
- replace `<a href="/Account/Login/ForgotPassword" className="text-[12.5px] font-semibold text-primary">` … `</a>` with `<Link to="/forgot-password" className="text-[12.5px] font-semibold text-primary">Forgot password?</Link>`;
- import `Link` from `react-router-dom` if it isn't already imported.

In `src/App.tsx`:
- import `ForgotPassword` and `ResetPassword`;
- add `<Route path="/forgot-password" element={<ForgotPassword />} />` and `<Route path="/reset-password" element={<ResetPassword />} />` to the signed-out routes.

- [ ] **Step 4: Run everything.**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all pass; lint 0; build ok.

- [ ] **Step 5: Commit**

```bash
git add src/auth src/modules/signin src/App.tsx
git commit -m "S1-03: Forgot password and Set a new password screens over the built-in Power Pages reset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Dev rollout — **APPROVAL** before Step 1 and before Step 4

**Files:**
- Create (plugin script): `.powerpages-site/cloud-flow-consumer/check-activation-link.cloudflowconsumer.yml`
- Modify: `.env.production`, `docs/Concreat_Hub_Architecture.md`, `docs/Concreat_Hub_Implementation_Plan.md` (S1-14 list)

- [ ] **Step 1: APPROVAL, then deploy the flows.**

Ask: "Deploy the updated activation flow and the two new flows (Check activation link, Send password reset) to Dev?"

Run: `python scripts/dataverse/portal_flows.py; rm -rf scripts/dataverse/__pycache__`
Expected:
- `= ACTIVATION: flow exists … definition updated`;
- `+ CHECK_LINK: flow …`, `+ PASSWORD_RESET: flow …`;
- each `on, in ConcreatHub: True`;
- three `…_FLOW_ID=` lines.

Run it again.
Expected: all `=`. Record the ids in the ledger.

- [ ] **Step 2: Register the check-link flow for anonymous visitors; set its id.**

```bash
PP=C:/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6
CHECK_ID=<CHECK_LINK_FLOW_ID from Step 1>
MSYS_NO_PATHCONV=1 node "$PP/skills/add-cloud-flow/scripts/create-cloud-flow-metadata.js" --projectRoot . --fileSlug check-activation-link --flowName "Concreat Connect – Check activation link" --flowId "$CHECK_ID" --flowTriggerUrl "" --flowApiUrl "/_api/cloudflow/v1.0/trigger/$CHECK_ID" --webRoleIds 24d62544-a66e-4660-81a6-ee467b783abb
printf 'VITE_CHECK_LINK_FLOW_ID=%s\n' "$CHECK_ID" >> .env.production
cat .powerpages-site/cloud-flow-consumer/check-activation-link.cloudflowconsumer.yml .env.production
```

Expected:
- the YAML's `flowapiurl` is `/_api/cloudflow/v1.0/trigger/<id>`, and the role is Anonymous Users;
- `.env.production` has both flow ids.

The password-reset flow is Dataverse-triggered and is **not** registered on the site.

- [ ] **Step 3: Record the rule-7 exception and the S1-14 additions.**

In `docs/Concreat_Hub_Architecture.md`, after the architecture rule about Power Automate (search "never on a synchronous read path"), add:

```markdown
  - **Exception (2026-10-06):** the *Check activation link* flow answers the Set password page on load (valid | invalid). Server Logic would need anonymous read access to `adx_invitation`, which holds secret codes; the flow's one-bit answer about a 128-bit random code reveals nothing useful.
```

In `docs/Concreat_Hub_Implementation_Plan.md`'s S1-14 row, after `move chp_BCClientSecret to a Key Vault-backed secret environment variable;` insert `rebind the chp_outlook connection reference (activation, password reset) to a service mailbox connection; register the Check activation link flow per environment and build with that environment's flow ids;`.

- [ ] **Step 4: APPROVAL, deploy the site, then commit.**

Ask: "Deploy the site (blocked check in company/me, new screens, check-link registration)?"

```bash
PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6
npm test && npm run lint && echo "{\"cwd\":\"$(pwd -W)\"}" | node "$PP/skills/add-server-logic/scripts/validate-serverlogic.js" && pac org who | grep "Org URL" && npm run build && pac pages upload-code-site --rootPath .
git add .powerpages-site/cloud-flow-consumer .env.production docs/Concreat_Hub_Architecture.md docs/Concreat_Hub_Implementation_Plan.md
git commit -m "S1-03: deploy D — check-link flow registered for anonymous visitors, flow ids, rule-7 exception recorded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `Upload complete`. `org380257ac` is shown before the upload.

---

### Task 10: Live acceptance on Dev and close-out

Use the Playwright browser on the private Dev site. Check data with `scripts/dataverse/dv.py` one-liners and flow run history (`get_run_actions`).

- [ ] **1. `ok`:** submit `nobody-<timestamp>@example.com` on `/activate`. Expected: "Check your email… expires in 24 hours", and the run ends in `Return_no_match`.
- [ ] **2. `already_active`:** submit an activated test address whose BC contact has portal access `true`. Ask the user which one; `full@example.com` has no BC contact, so it can't be used. Expected: the "Your account is already active" card.
- [ ] **3. `needs_help`:** submit an email on two portal-enabled customers. Ask the user for one, or confirm with a contact conflict (a second Dataverse contact sharing the email). Expected: the "We couldn't activate…" card, plus an ops notice in the sender mailbox.
- [ ] **4. Links:**
  - request activation twice for one unactivated portal-enabled address (ask the user);
  - check in Dataverse that only the newest invitation is active and its expiry is ~24 h ahead;
  - check that the email link contains `&email=`;
  - open the older link: expected "Checking your link…", then the expired card with no form;
  - open the newest link: expected the form with the email read-only;
  - after activating, open the same link again: expected the expired card on open.
- [ ] **5. Forgot password:**
  - on `/forgot-password`, submit an activated address;
  - the branded email arrives, and the Dataverse email is Canceled;
  - open the link: the email is read-only;
  - set a new password: "Your password has been reset"; sign in with it;
  - reopen the same link: expected the expired card;
  - note the actual token lifetime if Power Pages reports one, and fix the "1 hour" copy if it differs (test-first).
- [ ] **6. Blocked:**
  - ask the user to set `customerPortalAccess = false` on their BESTRADE contact;
  - sign in: expected the "Your access has been turned off" card, and `/_api/serverlogics/company` returns `{"blocked":true}` with no data;
  - the user sets it back to `true`; reload: expected the portal returns.
  - Record the extra latency of `me`/`company` (Edge DevTools → Network timing).
- [ ] **7. Close-out:**
  - update `docs/Concreat_Hub_Implementation_Plan.md`: S1-03 / S1-06 / S1-07 notes for D, with the statuses `✅ Done (Dev)` when sub-project C's remaining checks are also done;
  - update `PLANS.md` items 1–3 and 5–7 as done, and item 4 as out of scope by decision;
  - run `npm test`, `npm run lint`, `npm run build` and `git diff --check`, then commit.
