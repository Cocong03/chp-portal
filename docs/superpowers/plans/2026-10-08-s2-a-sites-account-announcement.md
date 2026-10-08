# S2 Sub-project A — List kit, Delivery Sites, Account and User Management, Announcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delivery Sites and Account and User Management screens on live BC data, the Dashboard announcement banner on a new Dataverse table, and the shared list components the later S2 sub-projects reuse.

**Architecture:** Two Server Logic endpoints (`sites` new, `company` extended) call BC through the generated shared helpers, scoped only from the session. The announcement is a portal-owned Dataverse table read through the Power Pages Web API. The SPA adds a TanStack Table v9 `DataTable` and small kit pieces in `src/ui/`, three lazily loaded module pages, and dev-server mocks built from the mockup's sample arrays.

**Tech Stack:** Power Pages Server Logic (JS, no modules), BC API `api/pasi/mcrm/v1.0`, Dataverse Web API (Python scripts in `scripts/dataverse/`), React 19 + Vite + TypeScript, Tailwind v4, shadcn/ui, TanStack Query 5, TanStack Table **v9** (`tableFeatures`, `useTable`, `table.FlexRender`), Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-08-s2-a-sites-account-announcement-design.md`

## Global Constraints

- Architecture rules in `CLAUDE.md` apply: the browser never calls BC; every BC call is scoped from `sessionScope()`, never from the request; every user value in an OData `$filter` goes through `odataLiteral()`.
- Server Logic: arrow callbacks only; no `require`/`import`/`eval`/`setTimeout`/`delete`/`prototype`/`Reflect.`; only HTTP verb functions at the top level (helpers are nested inside `get()`); the `#region bc-helpers` block is generated — edit `server-logic-src/bc-helpers.js`, then run `node scripts/stamp-server-logic-helpers.mjs`.
- Customer-facing copy is the mockup's wording exactly. Copy not in the mockup: *No delivery sites are registered on your account yet.* and *No contacts are registered on your account yet.* (both go on `docs/wording-checklist.md`). Load error copy: *We couldn't load this information. Please try again.* with a **Try again** button.
- Every page sets `document.title` with `usePageTitle('<Page>')` → `"<Page> — Concreat Connect"`.
- DTO field names mirror the mockup arrays: `SITES[]` → `SiteDto`, `ACCOUNTS[]` + `PORTAL_CONTACTS[]` → `CompanyDto` / `PortalContactDto`, `ANNOUNCEMENT` → `AnnouncementDto`.
- Web role ids: Full Access `56b29291-b981-4ef0-865b-41c1e9523a97` · Orders & Delivery `11bb7218-55fb-4cae-b8a1-5af2f41237c5` · Finance & Documents `c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3` · View Only `0c42c9f3-bc20-40a2-8c6a-a731a263ed83` · Authenticated Users `b2780841-e908-44f8-b7d8-dfd367bfeeb2`.
- Business role order, highest first: Full Access › Orders & Delivery › Finance & Documents › View Only.
- **BC field names used by this plan** (confirmed or replaced by Task 1): `mcrmShipToAddress` → `Customer_No, Code, Name, Address, Address_2, City, County, Post_Code, Contact, Phone_No, E_Mail`; `mcrmCustomers` default ship-to → `Ship_to_Code`; `MCRMContacts` → `no, companyNo, type, name, jobTitle, phoneNo, eMail, customerPortalAccess, privacyBlocked`; `mcrmBusinessRelation` → `contactNo, vendorNo, linktoTable`.
- Power Pages plugin scripts: run `PP="$HOME/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6/scripts"` in Git Bash before any command that uses `$PP` (Tasks 3 and 8). Run them from the repo root; they write into `.powerpages-site/`.
- **Ask the user before** the BC probe (Task 1), any Dataverse write (Task 8), and the deploy (Task 10). Confirm the target with `pac auth who`; deploy only with `pac pages upload-code-site --rootPath .`.
- Commit messages start with the plan task ID(s) (S2-02 / S2-14 / S2-19) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage only the files the task touched (the working tree has unrelated user edits).

## Review Focus

1. **A BC contact with a blank email** — never matched to a portal contact, so Portal access is **No**, and it is never marked "You" (an empty session email must not match it). → Task 3 test `a BC contact without an email is never matched or marked as you`.
2. **Email case/whitespace differs between BC and Dataverse** (`Buyer@Bestrade.ph ` vs `buyer@bestrade.ph`) — still the same person. → Task 3 test `matches BC and portal emails ignoring case and spaces`.
3. **A contact with several web roles, including Authenticated Users** — the Permissions column shows the single highest business role. → Task 3 test `shows the highest business role`.
4. **Search typed with extra spaces or different case, or only spaces** — trimmed and case-insensitive; whitespace-only counts as no search (every site is shown). → Task 6 `filterSites` cases `trimmed query` and `blank query`.
5. **Ship-to rows with blank optional parts** (`Address_2`, `County`, `Post_Code`) — no stray commas in the Address/City lines. → Task 2 test `joins address parts without blanks`.

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/dataverse/bc_probe.py` (new) | Read-only BC DEV field probe (prints field names, never secrets or personal values) |
| `.powerpages-site/server-logic/sites/sites.js` + `sites.serverlogic.yml` (new) | `sites` endpoint |
| `test/server-logic/sites.test.ts` (new) | `sites` unit tests |
| `server-logic-src/bc-helpers.js` | `sessionScope()` also returns `accountId` and `email` |
| `.powerpages-site/server-logic/company/company.js` | Company card + contacts merge |
| `test/server-logic/company.test.ts` | Updated + new contact tests |
| `.powerpages-site/table-permissions/…` (generated) | Contact same-account read; Announcement global read |
| `.powerpages-site/site-settings/Webapi-chp_announcement-*.sitesetting.yml` (generated) | Web API for the announcement |
| `scripts/dataverse/identity_schema.py` | Helpers importable (main guard) |
| `scripts/dataverse/announcement_schema.py` (new) | `chp_announcement` table |
| `scripts/dataverse/admin_role.py` | Admin role privileges on `chp_announcement` |
| `src/ui/{card,table,tooltip,alert}.tsx` (shadcn) | Primitives |
| `src/ui/DataTable.tsx`, `StatusPill.tsx`, `SearchField.tsx`, `Toolbar.tsx`, `QueryError.tsx`, `SectionCard.tsx` (+ tests) | List kit |
| `src/api/types.ts`, `src/mocks/index.ts` | DTOs, fixtures |
| `src/api/webApi.ts` (+ test) | Power Pages Web API GET |
| `src/modules/sites/{SitesPage.tsx,useSites.ts,filterSites.ts}` (+ tests) | Delivery Sites |
| `src/modules/account/{AccountPage.tsx,useCompany.ts}` (+ test) | Account and User Management |
| `src/modules/dashboard/{DashboardPage.tsx,AnnouncementBanner.tsx,useAnnouncement.ts}` (+ test) | Dashboard banner |
| `src/layout/SectionRoute.tsx` | Lazy module pages |
| `docs/…` | Spec facts, plan rows, wording checklist, runbook |

---

### Task 1: BC DEV field probe (read-only)

**Files:**
- Create: `scripts/dataverse/bc_probe.py`
- Modify: `docs/superpowers/specs/2026-10-08-s2-a-sites-account-announcement-design.md` (add a "BC DEV facts (probed 2026-10-08)" table)

**Interfaces:**
- Produces: confirmed BC field names. If any differ from the **BC field names** line in Global Constraints, record the replacements in the spec and use them in Tasks 2 and 3 (constants `SHIP_TO_FIELDS`, `DEFAULT_SHIP_TO_FIELD`, `CONTACT_FIELDS`, the row mappings, and the test fixtures — nothing else changes).

- [ ] **Step 1: Ask the user for approval.** The probe reads `chp_BCClientSecret` from the Dev Dataverse environment variable into memory only (never printed, logged or written to a file) and makes read-only BC GETs. Do not continue without a yes.

- [ ] **Step 2: Write the probe**

```python
"""Read-only BC DEV field probe for S2 sub-project A (ship-to, customer card, contacts). Dev only.

Prints field NAMES and how many sampled rows fill each one. Never prints the BC secret, the token or
personal values; only the enum-like fields in SHOW_VALUES print their values.

Usage (from the repo root): python scripts/dataverse/bc_probe.py C00000009
"""
import sys

import requests

from dv import Dataverse

SHOW_VALUES = {'type', 'linktoTable', 'customerPortalAccess', 'privacyBlocked'}

dv = Dataverse()


def env(schema):
    row = dv.get(f"environmentvariabledefinitions?$select=defaultvalue&$filter=schemaname eq '{schema}'"
                 "&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)")['value'][0]
    values = row['environmentvariabledefinition_environmentvariablevalue']
    return (values[0]['value'] if values else row['defaultvalue'] or '').strip()


tenant = env('chp_BCTenantId')
token_response = requests.post(f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token', data={
    'grant_type': 'client_credentials', 'client_id': env('chp_BCClientId'),
    'client_secret': env('chp_BCClientSecret'), 'scope': 'https://api.businesscentral.dynamics.com/.default'}, timeout=30)
if not token_response.ok:
    raise SystemExit(f'token request failed: {token_response.status_code}')
headers = {'Authorization': 'Bearer ' + token_response.json()['access_token'], 'Accept': 'application/json'}
root = (f"https://api.businesscentral.dynamics.com/v2.0/{tenant}/{env('chp_BCEnvironmentName')}"
        f"{env('chp_BCApiBasePath')}/companies({env('chp_BCSolidCementCompanyId')})/")
customer = sys.argv[1]


def probe(entity, params):
    response = requests.get(root + entity, params=params, headers=headers, timeout=30)
    print(f'\n== {entity} {params} -> {response.status_code}')
    if not response.ok:
        print('  ' + response.text[:300])
        return []
    rows = response.json().get('value', [])
    print(f'  {len(rows)} row(s)')
    for key in (rows[0].keys() if rows else []):
        filled = sum(1 for row in rows if row.get(key) not in (None, ''))
        sample = f" values {sorted({str(row.get(key)) for row in rows})}" if key in SHOW_VALUES else ''
        print(f'  {key}: {filled}/{len(rows)} filled{sample}')
    return rows


probe('mcrmShipToAddress', {'$top': '5'})
probe('mcrmShipToAddress', {'$filter': f"Customer_No eq '{customer}'"})
probe('mcrmCustomers', {'$filter': f"Customer_No eq '{customer}'"})
relations = probe('mcrmBusinessRelation', {'$filter': f"vendorNo eq '{customer}' and linktoTable eq 'Customer'"})
if relations:
    company_no = relations[0]['contactNo']
    probe('MCRMContacts', {'$filter': f"companyNo eq '{company_no}'", '$top': '10'})
    probe('MCRMContacts', {'$filter': f"companyNo eq '{company_no}' and type eq 'Person'", '$top': '10'})
```

- [ ] **Step 3: Run it** for the Dev test customer: `python scripts/dataverse/bc_probe.py C00000009`
Expected: each probe prints `200` and its field names. If the `Customer_No` filter on `mcrmShipToAddress` returns 400, read the real customer field name from the first probe's field list and re-run with it.

- [ ] **Step 4: Record the facts in the spec.** Add under "BC dependencies":

```markdown
## BC DEV facts (probed 2026-10-08, read-only)

| API | Fields used | Notes |
|---|---|---|
| `mcrmShipToAddress` | <customer no. field>, <code>, <name>, <address lines>, <city>, <county>, <post code>, <contact>, <phone>, <email> | <filter by customer works? how many rows for C00000009> |
| `mcrmCustomers` | <default ship-to field, or "none"> | |
| `MCRMContacts` | <job title field>, <phone field>, `customerPortalAccess`, `privacyBlocked`, `type` values | <`type eq 'Person'` filter works?> |
```

Fill every `<…>` with what the probe printed. If `mcrmCustomers` has no ship-to code field, write "none — `isDefault` stays false (S2-01)". If `MCRMContacts` has a customer no. field, note it (Task 3 can then skip the relation hop; keep the hop unless it does).

- [ ] **Step 5: Commit**

```bash
git add scripts/dataverse/bc_probe.py docs/superpowers/specs/2026-10-08-s2-a-sites-account-announcement-design.md
git commit -m "S2-02/S2-19: read-only BC field probe; DEV ship-to, customer and contact field names recorded in the spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `sites` Server Logic

**Files:**
- Create: `.powerpages-site/server-logic/sites/sites.js`
- Create: `.powerpages-site/server-logic/sites/sites.serverlogic.yml`
- Test: `test/server-logic/sites.test.ts`

**Interfaces:**
- Consumes: shared helpers `sessionScope`, `bcGet`, `odataQuery`, `odataLiteral`, `respond` (from the stamped region).
- Produces: `GET /_api/serverlogics/sites` → JSON array of `{ code, name, address, city, contact, phone, email, isDefault }` sorted by `code` (the SPA's `SiteDto`, Task 6).

- [ ] **Step 1: Write the failing test** — `test/server-logic/sites.test.ts`

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/sites/sites.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1',
  'BC/EnvironmentName': 'DEV',
  'BC/ApiBasePath': '/api/pasi/mcrm/v1.0',
  'BC/ClientId': 'client-1',
  'BC/ClientSecret': 'secret-1',
}
const SHIP_TO = {
  Customer_No: 'C00000009', Code: 'PLANT2', Name: 'Plant 2 — North Depot', Address: 'National Highway', Address_2: 'Brgy. Sta. Cruz',
  City: 'Angat', County: 'Bulacan', Post_Code: '3012', Contact: 'Ligaya Fernandez', Phone_No: '(044) 815-2207', E_Mail: '',
}
const ok = (value: unknown) => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(value) })

function fakeServer({
  account = { accountid: 'acc-1', name: 'BESTRADE', chp_bccustomerno: 'C00000009', chp_bccompanyid: 'co-1' } as unknown,
  shipTos = [SHIP_TO, { ...SHIP_TO, Code: 'PLANT1', Name: 'Plant 1 — Main Yard' }] as unknown[],
  customers = [{ Customer_No: 'C00000009', Ship_to_Code: 'PLANT1' }] as unknown[],
  bcDown = false,
  context = { ServerLogicName: 'sites', QueryParameters: {}, Body: '' } as unknown,
} = {}) {
  const http: { url: string }[] = []
  const server = {
    User: { contactid: 'c-1' },
    Context: context,
    SiteSetting: { Get: (name: string) => SETTINGS[name] },
    Logger: { Log() {}, Error() {}, Warn() {} },
    Connector: {
      Dataverse: { RetrieveRecord: () => ({ contactid: 'c-1', emailaddress1: 'buyer@bestrade.ph', parentcustomerid_account: account }) },
      HttpClient: {
        PostAsync: async () => JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify({ access_token: 'tok-1' }) }),
        GetAsync: async (url: string) => {
          http.push({ url })
          if (url.includes('/MCRMContacts')) return ok({ value: [{ companyNo: 'CT0001' }] })
          if (url.includes('/mcrmBusinessRelation')) return ok({ value: [{ vendorNo: (account as { chp_bccustomerno: string }).chp_bccustomerno }] })
          if (bcDown) return JSON.stringify({ StatusCode: 503, IsSuccessStatusCode: false, ReasonPhrase: 'Service Unavailable', Body: '' })
          if (url.includes('/mcrmShipToAddress')) return ok({ value: shipTos })
          return ok({ value: customers })
        },
      },
    },
  }
  return { server, http }
}

const SAFE = "We couldn't load this information. Please try again."
const decoded = (http: { url: string }[], entity: string) => decodeURIComponent(http.find((c) => c.url.includes(`/${entity}?`))!.url)

test("returns the session customer's ship-tos in the wireframe's SITES shape, sorted by code, default flagged", async () => {
  const { server } = fakeServer()
  expect(JSON.parse(await load(server).get())).toEqual([
    {
      code: 'PLANT1', name: 'Plant 1 — Main Yard', address: 'National Highway, Brgy. Sta. Cruz', city: 'Angat, Bulacan, 3012',
      contact: 'Ligaya Fernandez', phone: '(044) 815-2207', email: '', isDefault: true,
    },
    {
      code: 'PLANT2', name: 'Plant 2 — North Depot', address: 'National Highway, Brgy. Sta. Cruz', city: 'Angat, Bulacan, 3012',
      contact: 'Ligaya Fernandez', phone: '(044) 815-2207', email: '', isDefault: false,
    },
  ])
})

test('joins address parts without blanks', async () => {
  const { server } = fakeServer({ shipTos: [{ ...SHIP_TO, Address_2: '  ', County: '', Post_Code: null }] })
  const [site] = JSON.parse(await load(server).get())
  expect(site.address).toBe('National Highway')
  expect(site.city).toBe('Angat')
})

test('filters ship-tos and the customer card on the session customer, quotes doubled', async () => {
  const { server, http } = fakeServer({
    account: { accountid: 'acc-1', name: 'X', chp_bccustomerno: "O'1 2", chp_bccompanyid: 'co-1' },
    shipTos: [{ ...SHIP_TO, Customer_No: "O'1 2" }],
    customers: [{ Customer_No: "O'1 2", Ship_to_Code: 'PLANT2' }],
  })
  await load(server).get()
  expect(decoded(http, 'mcrmShipToAddress')).toContain("companies(co-1)/mcrmShipToAddress?$filter=Customer_No eq 'O''1 2'")
  expect(decoded(http, 'mcrmCustomers')).toContain("$filter=Customer_No eq 'O''1 2'")
})

test('ignores customer or company values sent in the request', async () => {
  const { server, http } = fakeServer({
    context: { ServerLogicName: 'sites', QueryParameters: { customerNo: 'C99', companyId: 'other' }, Body: '{"customerNo":"C99"}' },
  })
  await load(server).get()
  expect(http.map((c) => c.url).join(' ')).not.toMatch(/C99|other/)
})

test("drops a row that belongs to another customer", async () => {
  const { server } = fakeServer({ shipTos: [SHIP_TO, { ...SHIP_TO, Customer_No: 'C00000001', Code: 'ZZZ' }] })
  expect(JSON.parse(await load(server).get()).map((s: { code: string }) => s.code)).toEqual(['PLANT2'])
})

test('no site is default when the customer card has no ship-to code', async () => {
  const { server } = fakeServer({ customers: [{ Customer_No: 'C00000009', Ship_to_Code: '' }] })
  expect(JSON.parse(await load(server).get()).every((s: { isDefault: boolean }) => !s.isDefault)).toBe(true)
})

test('BC down → only the customer-safe error', async () => {
  const { server } = fakeServer({ bcDown: true })
  await expect(load(server).get()).rejects.toThrow(SAFE)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/server-logic/sites.test.ts`
Expected: FAIL — `ENOENT … sites.js`.

- [ ] **Step 3: Write the endpoint** — `.powerpages-site/server-logic/sites/sites.js` (the region is empty here; Step 4 fills it)

```js
// Server Logic: sites (S2-02)
// Purpose: the signed-in customer's BC ship-to addresses for the Delivery Sites list.
// API URL: https://<site>/_api/serverlogics/sites
// Customer and company come only from the session's Account; nothing is read from the request.

async function get() {
    // #region bc-helpers (generated from server-logic-src/bc-helpers.js — do not edit)
    // #endregion bc-helpers

    // BC DEV field names (probed 2026-10-08, see the S2-A spec).
    var SHIP_TO_FIELDS = "Customer_No,Code,Name,Address,Address_2,City,County,Post_Code,Contact,Phone_No,E_Mail";
    // Standard BC keeps a customer's default ship-to on the customer card. Set to "" if mcrmCustomers doesn't expose it (S2-01).
    var DEFAULT_SHIP_TO_FIELD = "Ship_to_Code";

    function joined(parts) {
        return parts.filter((part) => part && String(part).trim()).join(", ");
    }

    async function defaultShipTo(scope) {
        if (!DEFAULT_SHIP_TO_FIELD) {
            return "";
        }
        var result = await bcGet(
            scope,
            "mcrmCustomers",
            odataQuery({ $filter: "Customer_No eq " + odataLiteral(scope.customerNo), $select: "Customer_No," + DEFAULT_SHIP_TO_FIELD })
        );
        var row = ((result && result.value) || []).find((r) => r.Customer_No === scope.customerNo);
        return (row && row[DEFAULT_SHIP_TO_FIELD]) || "";
    }

    Server.Logger.Log("sites GET called");
    return respond(async () => {
        var scope = await sessionScope();
        var results = await Promise.all([
            bcGet(
                scope,
                "mcrmShipToAddress",
                odataQuery({ $filter: "Customer_No eq " + odataLiteral(scope.customerNo), $select: SHIP_TO_FIELDS, $top: "500" })
            ),
            defaultShipTo(scope)
        ]);
        var defaultCode = results[1];
        return ((results[0] && results[0].value) || [])
            // Defence in depth: only the session customer's rows, whatever BC returns.
            .filter((row) => row.Customer_No === scope.customerNo)
            .map((row) => ({
                code: row.Code || "",
                name: row.Name || "",
                address: joined([row.Address, row.Address_2]),
                city: joined([row.City, row.County, row.Post_Code]),
                contact: row.Contact || "",
                phone: row.Phone_No || "",
                email: row.E_Mail || "",
                isDefault: !!defaultCode && row.Code === defaultCode
            }))
            .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    });
}
```

- [ ] **Step 4: Stamp the helpers and add the record**

Run: `node scripts/stamp-server-logic-helpers.mjs`
Expected: `stamped: …\sites\sites.js`

Create `.powerpages-site/server-logic/sites/sites.serverlogic.yml`:

```yaml
adx_serverlogic_adx_webrole:
  - 56b29291-b981-4ef0-865b-41c1e9523a97
  - 11bb7218-55fb-4cae-b8a1-5af2f41237c5
description: 'Signed-in customer''s BC ship-to addresses for Delivery Sites (S2-02)'
display_name: 'Sites (BC ship-to addresses)'
id: 586ce8ae-ad9b-472c-a7e1-06ee3c1da382
name: sites
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/server-logic`
Expected: PASS, including `bc-helpers.test.ts` (drift + validator checks now also cover `sites.js`).

- [ ] **Step 6: Commit**

```bash
git add .powerpages-site/server-logic/sites test/server-logic/sites.test.ts
git commit -m "S2-02: sites Server Logic — session customer's BC ship-tos in the SITES shape, default from the customer card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `company` returns contacts with portal access (+ helper scope, table permission)

**Files:**
- Modify: `server-logic-src/bc-helpers.js` (`sessionScope`)
- Modify: `.powerpages-site/server-logic/company/company.js` (body after the region)
- Modify (stamper): `me.js`, `company.js`, `sites.js` regions
- Test: `test/server-logic/company.test.ts`
- Create (script): `.powerpages-site/table-permissions/Contact-same-account-(read).tablepermission.yml`

**Interfaces:**
- Consumes: Task 2's stamped helpers.
- Produces: `sessionScope()` → `{ contactId, accountId, email, customerNo, companyId, customerName }` (`email` lower-cased, trimmed). `GET company` → `{ customerNo, customerName, address, website, vatRegNumber, phone, email, contacts: [{ name, title, phone, email, portalAccess, portalRole, isYou }] }`.

- [ ] **Step 1: Write the failing tests.** In `test/server-logic/company.test.ts`, replace `fakeServer` with the version below (adds the contacts reads), change the first test's expected value, and append the new tests.

Replace the `fakeServer` function:

```ts
const PERSON = {
  no: 'P0001', companyNo: 'CT0001', type: 'Person', name: 'Buyer One', jobTitle: 'Owner', phoneNo: '0917 000 0001',
  eMail: 'Buyer@Bestrade.ph', customerPortalAccess: true, privacyBlocked: false,
}
const PORTAL = { emailaddress1: 'buyer@bestrade.ph', powerpagecomponent_mspp_webrole_contact: [{ name: 'Authenticated Users' }, { name: 'Full Access' }] }

function fakeServer({
  user = { contactid: 'c-1' } as unknown,
  email = 'Buyer@Bestrade.ph' as unknown,
  account = { accountid: 'acc-1', name: 'BESTRADE COMMODITY SALES CORP.', chp_bccustomerno: 'C00000009', chp_bccompanyid: 'co-1' } as unknown,
  portalContacts = [{ companyNo: 'CT0001' }] as unknown[],
  relations = [{ vendorNo: 'C00000009' }] as unknown[],
  customerRelations = [{ contactNo: 'CT0001', vendorNo: 'C00000009' }] as unknown[],
  people = [PERSON] as unknown[],
  dvContacts = [PORTAL] as unknown[],
  dataverseDown = false,
  peopleDown = false,
  rows = [ROW] as unknown[],
  tokenStatus = 200,
  tokenResponse = undefined as unknown,
  bcDown = false,
  settings = SETTINGS,
  context = { ServerLogicName: 'company', QueryParameters: {}, Body: '' } as unknown,
} = {}) {
  const http: { method: string; url: string; body?: string; headers?: unknown; contentType?: string }[] = []
  const dataverse: { op: string; args: unknown[] }[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const server = {
    User: user,
    Context: context,
    SiteSetting: { Get: (name: string) => settings[name] },
    Logger: { Log() {}, Error: (m: string) => errors.push(m), Warn: (m: string) => warnings.push(m) },
    Connector: {
      Dataverse: {
        RetrieveRecord: (...args: unknown[]) => {
          dataverse.push({ op: 'RetrieveRecord', args })
          return { contactid: 'c-1', emailaddress1: email, parentcustomerid_account: account }
        },
        RetrieveMultipleRecords: (...args: unknown[]) => {
          dataverse.push({ op: 'RetrieveMultipleRecords', args })
          if (dataverseDown) throw new Error('dataverse 403 Forbidden')
          return JSON.stringify({ value: dvContacts })
        },
      },
      HttpClient: {
        PostAsync: async (url: string, body: string, headers: unknown, contentType: string) => {
          http.push({ method: 'POST', url, body, headers, contentType })
          return JSON.stringify(
            tokenResponse ?? { StatusCode: tokenStatus, IsSuccessStatusCode: tokenStatus < 400, Body: JSON.stringify({ access_token: 'tok-1' }) },
          )
        },
        GetAsync: async (url: string, headers: unknown) => {
          http.push({ method: 'GET', url, headers })
          const plain = decodeURIComponent(url)
          if (bcDown) return JSON.stringify({ StatusCode: 503, IsSuccessStatusCode: false, ReasonPhrase: 'Service Unavailable', Body: '' })
          if (plain.includes('/MCRMContacts') && plain.includes('tolower(eMail)')) return ok({ value: portalContacts })
          if (plain.includes('/MCRMContacts')) {
            if (peopleDown) return JSON.stringify({ StatusCode: 500, IsSuccessStatusCode: false, ReasonPhrase: 'Error', Body: '' })
            return ok({ value: people })
          }
          if (plain.includes('/mcrmBusinessRelation') && plain.includes('vendorNo eq')) return ok({ value: customerRelations })
          if (plain.includes('/mcrmBusinessRelation')) return ok({ value: relations })
          return ok({ value: rows })
        },
      },
    },
  }
  return { server, http, dataverse, errors, warnings }
}
```

Change the first test's expected object to:

```ts
  expect(JSON.parse(await load(server).get())).toEqual({
    customerNo: 'C00000009',
    customerName: 'BESTRADE COMMODITY SALES CORP.',
    address: '12 Main St, Pasig, NCR, 1600',
    website: '',
    vatRegNumber: '123-456',
    phone: '0917',
    email: 'ops@bestrade.ph',
    contacts: [
      { name: 'Buyer One', title: 'Owner', phone: '0917 000 0001', email: 'Buyer@Bestrade.ph', portalAccess: true, portalRole: 'Full Access', isYou: true },
    ],
  })
```

Append:

```ts
const contactsOf = async (options: Parameters<typeof fakeServer>[0]) =>
  JSON.parse(await load(fakeServer(options).server).get()).contacts as {
    name: string; email: string; portalAccess: boolean; portalRole: string; isYou: boolean
  }[]

test("reads the session account id and lists the portal contacts on that account with their web roles", async () => {
  const { server, dataverse } = fakeServer()
  await load(server).get()
  expect(dataverse[0].args[2]).toContain('parentcustomerid_account($select=accountid,name,chp_bccustomerno,chp_bccompanyid)')
  const list = dataverse.find((d) => d.op === 'RetrieveMultipleRecords')!
  expect(list.args[0]).toBe('contacts')
  expect(list.args[1]).toBe(
    '$select=emailaddress1&$filter=_parentcustomerid_value eq acc-1&$expand=powerpagecomponent_mspp_webrole_contact($select=name)',
  )
})

test("lists the customer's BC person contacts through the business relation, quotes doubled", async () => {
  const { server, http } = fakeServer({
    account: { accountid: 'acc-1', name: 'X', chp_bccustomerno: "O'1", chp_bccompanyid: 'co-1' },
    relations: [{ vendorNo: "O'1" }],
    customerRelations: [{ contactNo: "CT'7", vendorNo: "O'1" }],
    people: [{ ...PERSON, companyNo: "CT'7" }],
    rows: [{ ...ROW, Customer_No: "O'1" }],
  })
  await load(server).get()
  const urls = http.map((c) => decodeURIComponent(c.url))
  expect(urls.some((u) => u.includes("mcrmBusinessRelation?$filter=vendorNo eq 'O''1' and linktoTable eq 'Customer'"))).toBe(true)
  expect(urls.some((u) => u.includes("MCRMContacts?$filter=(companyNo eq 'CT''7') and type eq 'Person'"))).toBe(true)
})

test.each([
  ['activated, business role and BC flag on → Yes', {}, true, 'Full Access'],
  ['BC customerPortalAccess off → No', { people: [{ ...PERSON, customerPortalAccess: false }] }, false, ''],
  ['not activated (no portal contact) → No', { dvContacts: [] }, false, ''],
  ['activated without a business role → No', { dvContacts: [{ ...PORTAL, powerpagecomponent_mspp_webrole_contact: [{ name: 'Authenticated Users' }] }] }, false, ''],
])('portal access: %s', async (_case, options, access, role) => {
  const [contact] = await contactsOf(options as Parameters<typeof fakeServer>[0])
  expect(contact.portalAccess).toBe(access)
  expect(contact.portalRole).toBe(role)
})

test('shows the highest business role', async () => {
  const roles = [{ name: 'View Only' }, { name: 'Authenticated Users' }, { name: 'Orders & Delivery' }]
  const [contact] = await contactsOf({ dvContacts: [{ ...PORTAL, powerpagecomponent_mspp_webrole_contact: roles }] })
  expect(contact.portalRole).toBe('Orders & Delivery')
})

test('matches BC and portal emails ignoring case and spaces', async () => {
  const [contact] = await contactsOf({
    people: [{ ...PERSON, eMail: ' BUYER@bestrade.PH ' }],
    dvContacts: [{ ...PORTAL, emailaddress1: 'Buyer@Bestrade.ph ' }],
  })
  expect(contact.portalAccess).toBe(true)
  expect(contact.isYou).toBe(true)
})

test('a BC contact without an email is never matched or marked as you', async () => {
  // A portal contact with a blank email exists too: blank must not match blank.
  const [contact] = await contactsOf({ people: [{ ...PERSON, eMail: '' }], dvContacts: [PORTAL, { ...PORTAL, emailaddress1: '' }] })
  expect(contact.portalAccess).toBe(false)
  expect(contact.isYou).toBe(false)
})

test('marks only the signed-in contact as you and lists them first', async () => {
  const contacts = await contactsOf({
    people: [{ ...PERSON, name: 'Ana Cruz', eMail: 'ana@bestrade.ph' }, PERSON],
    dvContacts: [PORTAL],
  })
  expect(contacts.map((c) => [c.name, c.isYou])).toEqual([['Buyer One', true], ['Ana Cruz', false]])
})

test('skips privacy-blocked BC contacts and portal contacts that are not in BC', async () => {
  const contacts = await contactsOf({
    people: [PERSON, { ...PERSON, name: 'Hidden', eMail: 'hidden@bestrade.ph', privacyBlocked: true }],
    dvContacts: [PORTAL, { ...PORTAL, emailaddress1: 'portal-only@bestrade.ph' }],
  })
  expect(contacts.map((c) => c.name)).toEqual(['Buyer One'])
})

test('no contacts when the customer has no linked company contact', async () => {
  expect(await contactsOf({ customerRelations: [] })).toEqual([])
})

test.each([
  ['the Dataverse contact read fails', { dataverseDown: true }],
  ['the BC contacts read fails', { peopleDown: true }],
])('%s → the whole call fails with the customer-safe error', async (_case, options) => {
  const { server } = fakeServer(options)
  await expect(load(server).get()).rejects.toThrow(SAFE)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/server-logic/company.test.ts`
Expected: FAIL — the first test misses `website`/`contacts`; the new tests fail on missing contacts / Dataverse calls.

- [ ] **Step 3: Extend `sessionScope()`** in `server-logic-src/bc-helpers.js` — replace the expand string and the `scope` line:

```js
            "$select=contactid,emailaddress1&$expand=parentcustomerid_account($select=accountid,name,chp_bccustomerno,chp_bccompanyid)"
```

```js
    var scope = {
        contactId: user.contactid,
        accountId: account.accountid,
        email: String(contact.emailaddress1 || "").trim().toLowerCase(),
        customerNo: account.chp_bccustomerno,
        companyId: account.chp_bccompanyid,
        customerName: account.name || ""
    };
```

- [ ] **Step 4: Replace the body after `// #endregion bc-helpers` in `company.js`** (keep the region and the header comment; update the header's first line to `// Server Logic: company (S1-06; contacts S2-19)` and Purpose to `the signed-in contact's own BC customer card and its contacts with portal access.`):

```js
    // Highest first; the Permissions column shows one role.
    var BUSINESS_ROLES = ["Full Access", "Orders & Delivery", "Finance & Documents", "View Only"];
    // BC DEV field names (probed 2026-10-08, see the S2-A spec).
    var CONTACT_FIELDS = "no,companyNo,type,name,jobTitle,phoneNo,eMail,customerPortalAccess,privacyBlocked";

    function lower(value) {
        return String(value || "").trim().toLowerCase();
    }

    async function customerCard(scope) {
        var result = await bcGet(
            scope,
            "mcrmCustomers",
            odataQuery({
                $filter: "Customer_No eq " + odataLiteral(scope.customerNo),
                $select: "Customer_No,Name,Address,Address_2,City,County,Post_Code,VATRegNo,Phone_No,EMail"
            })
        );
        var rows = (result && result.value) || [];
        // Detail ownership check: exactly the session customer, nothing else.
        if (rows.length !== 1 || rows[0].Customer_No !== scope.customerNo) {
            throw new Error("not-found " + scope.customerNo);
        }
        var row = rows[0];
        return {
            customerNo: row.Customer_No,
            customerName: row.Name || "",
            address: [row.Address, row.Address_2, row.City, row.County, row.Post_Code]
                .filter((part) => part && String(part).trim())
                .join(", "),
            // mcrmCustomers has no website field yet (BC ask, S2-18).
            website: "",
            vatRegNumber: row.VATRegNo || "",
            phone: row.Phone_No || "",
            email: row.EMail || ""
        };
    }

    // The customer's BC person contacts: its company contacts (business relation), then their people.
    async function bcPeople(scope) {
        var relations = await bcGet(
            scope,
            "mcrmBusinessRelation",
            odataQuery({ $filter: "vendorNo eq " + odataLiteral(scope.customerNo) + " and linktoTable eq 'Customer'", $select: "contactNo,vendorNo" })
        );
        var companyNos = ((relations && relations.value) || [])
            .filter((row) => row.vendorNo === scope.customerNo && row.contactNo)
            .map((row) => row.contactNo);
        if (companyNos.length === 0) {
            return [];
        }
        var people = await bcGet(
            scope,
            "MCRMContacts",
            odataQuery({
                $filter: "(" + companyNos.map((no) => "companyNo eq " + odataLiteral(no)).join(" or ") + ") and type eq 'Person'",
                $select: CONTACT_FIELDS,
                $top: "200"
            })
        );
        return ((people && people.value) || []).filter((row) => companyNos.indexOf(row.companyNo) >= 0 && !row.privacyBlocked);
    }

    // Portal contacts on the session's Account and their web roles (table permission "Contact - same account (read)").
    function portalContacts(scope) {
        var result = parseResult(
            Server.Connector.Dataverse.RetrieveMultipleRecords(
                "contacts",
                "$select=emailaddress1&$filter=_parentcustomerid_value eq " + scope.accountId +
                    "&$expand=powerpagecomponent_mspp_webrole_contact($select=name)"
            ),
            "dataverse"
        );
        return ((result && result.value) || []).map((row) => ({
            email: lower(row.emailaddress1),
            roles: (row.powerpagecomponent_mspp_webrole_contact || []).map((role) => role.name)
        }));
    }

    // Portal access = activated on this account + a business web role + BC customerPortalAccess (S2-A decision 1).
    function contactRow(person, portal, you) {
        var email = lower(person.eMail);
        var match = email ? portal.find((p) => p.email === email) : undefined;
        var role = match ? BUSINESS_ROLES.find((name) => match.roles.indexOf(name) >= 0) || "" : "";
        var access = role !== "" && person.customerPortalAccess === true;
        return {
            name: person.name || "",
            title: person.jobTitle || "",
            phone: person.phoneNo || "",
            email: String(person.eMail || "").trim(),
            portalAccess: access,
            portalRole: access ? role : "",
            isYou: email !== "" && email === you
        };
    }

    Server.Logger.Log("company GET called");
    return respond(async () => {
        var scope = await sessionScope();
        var results = await Promise.all([customerCard(scope), bcPeople(scope)]);
        var portal = portalContacts(scope);
        var card = results[0];
        card.contacts = results[1]
            .map((person) => contactRow(person, portal, scope.email))
            .sort((a, b) => (a.isYou !== b.isYou ? (a.isYou ? -1 : 1) : a.name.localeCompare(b.name)));
        return card;
    });
}
```

- [ ] **Step 5: Re-stamp and run the Server Logic tests**

Run: `node scripts/stamp-server-logic-helpers.mjs` then `npx vitest run test/server-logic`
Expected: `stamped:` for me, company, sites; all tests PASS (the `me` and `sites` fakes return accounts without `accountid` — `accountId` is just `undefined` there and unused).

- [ ] **Step 6: Add the table permission** (Account scope: contacts whose `parentcustomerid` is the signed-in contact's account)

```bash
node "$PP/create-table-permission.js" --projectRoot . --permissionName "Contact - same account (read)" --tableName contact \
  --webRoleIds 56b29291-b981-4ef0-865b-41c1e9523a97,11bb7218-55fb-4cae-b8a1-5af2f41237c5,c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3,0c42c9f3-bc20-40a2-8c6a-a731a263ed83 \
  --scope Account --read --accountRelationshipName contact_customer_accounts
```
Expected: JSON with the new file path; the YAML has `scope: 756150002`, `accountrelationship: contact_customer_accounts`, `read: true`, everything else false.

- [ ] **Step 7: Commit**

```bash
git add server-logic-src/bc-helpers.js .powerpages-site/server-logic .powerpages-site/table-permissions test/server-logic/company.test.ts
git commit -m "S2-19: company returns BC contacts with portal access (activated + business role + BC flag), highest role, you first; same-account Contact read permission

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: List kit (`src/ui/`)

**Files:**
- Create (shadcn): `src/ui/card.tsx`, `src/ui/table.tsx`, `src/ui/tooltip.tsx`, `src/ui/alert.tsx`
- Create: `src/ui/StatusPill.tsx`, `src/ui/DataTable.tsx`, `src/ui/SearchField.tsx`, `src/ui/Toolbar.tsx`, `src/ui/QueryError.tsx`, `src/ui/SectionCard.tsx`
- Test: `src/ui/DataTable.test.tsx`, `src/ui/StatusPill.test.tsx`

**Interfaces:**
- Produces:
  - `type PillTone = 'good' | 'warn' | 'bad' | 'neutral' | 'progress'`; `StatusPill(props: ComponentProps<'span'> & { tone?: PillTone })` (sets `data-tone`).
  - `type DataColumn<T> = ColumnDef<typeof dataTableFeatures, T>`; column `meta?: { className?: string }` applies to its `th`/`td`.
  - `DataTable<T>({ label, columns, data, emptyMessage, loading?, className? })`.
  - `SearchField(props: Omit<ComponentProps<'input'>, 'type'> & { label: string })`.
  - `Toolbar({ children, onClear })` — renders `children`, a spacer, and **Clear filters**.
  - `QueryError({ onRetry })` — `role="alert"`, text `LOAD_ERROR`, **Try again**. `export const LOAD_ERROR = "We couldn't load this information. Please try again."`
  - `SectionCard({ title, children, className? })` — card + `h2`.

- [ ] **Step 1: Add the shadcn primitives**

Run: `npx shadcn@latest add card table tooltip alert`
Expected: four files created in `src/ui/`. If it asks to overwrite an existing file, answer no. (`badge` is not needed: `StatusPill` is the wrapper DESIGN.md asks for.)

- [ ] **Step 2: Write the failing tests**

`src/ui/StatusPill.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'

test('renders its text with the given tone, neutral by default', () => {
  render(
    <>
      <StatusPill tone="good">Default</StatusPill>
      <StatusPill>No</StatusPill>
    </>,
  )
  expect(screen.getByText('Default')).toHaveAttribute('data-tone', 'good')
  expect(screen.getByText('No')).toHaveAttribute('data-tone', 'neutral')
})
```

`src/ui/DataTable.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { DataTable, type DataColumn } from './DataTable'

type Row = { code: string; city: string }
const columns: DataColumn<Row>[] = [
  { id: 'code', header: 'Code', cell: ({ row }) => row.original.code, meta: { className: 'font-mono' } },
  { id: 'city', header: 'City', cell: ({ row }) => row.original.city },
]
const rows: Row[] = [{ code: 'PLANT1', city: 'Antipolo' }, { code: 'PLANT2', city: 'Angat' }]
const none: Row[] = []

test('renders headers and one row per item', () => {
  render(<DataTable label="Sites" columns={columns} data={rows} emptyMessage="Nothing here." />)
  const table = screen.getByRole('table', { name: 'Sites' })
  expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Code', 'City'])
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(within(table).getByRole('cell', { name: 'PLANT2' })).toBeInTheDocument()
})

test('an empty list shows one row with the message across all columns', () => {
  render(<DataTable label="Sites" columns={columns} data={none} emptyMessage="Nothing here." />)
  const cell = screen.getByRole('cell', { name: 'Nothing here.' })
  expect(cell).toHaveAttribute('colspan', '2')
})

test('while loading it shows placeholder rows and no empty message', () => {
  render(<DataTable label="Sites" columns={columns} data={none} loading emptyMessage="Nothing here." />)
  expect(screen.queryByText('Nothing here.')).not.toBeInTheDocument()
  expect(screen.getByRole('table', { name: 'Sites' })).toHaveAttribute('aria-busy', 'true')
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/ui/DataTable.test.tsx src/ui/StatusPill.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write the kit**

`src/ui/StatusPill.tsx`:

```tsx
import type { ComponentProps } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export type PillTone = 'good' | 'warn' | 'bad' | 'neutral' | 'progress'

// DESIGN.md §5–6: rounded pill with a 6px currentColor dot.
const pill = cva(
  "inline-flex items-center gap-[5px] rounded-full px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:content-['']",
  {
    variants: {
      tone: {
        good: 'bg-success-soft text-success',
        warn: 'bg-warning-soft text-warning',
        bad: 'bg-destructive-soft text-destructive',
        neutral: 'bg-accent text-accent-foreground',
        progress: 'bg-primary text-primary-foreground',
      },
    },
  },
)

/** Status pill. Map a domain's statuses to a tone where they're shown (DESIGN.md §6); unknown → neutral. */
export function StatusPill({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { tone?: PillTone }) {
  return <span data-tone={tone} className={cn(pill({ tone }), className)} {...props} />
}
```

`src/ui/DataTable.tsx`:

```tsx
import { tableFeatures, useTable, type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'

export const dataTableFeatures = tableFeatures({})
export type DataColumn<T> = ColumnDef<typeof dataTableFeatures, T>

const metaClass = (meta: unknown) => (meta as { className?: string } | undefined)?.className
const LOADING_ROWS = [0, 1, 2]

/**
 * The portal's table (DESIGN.md §5): wireframe header and cell styles, skeleton rows while loading,
 * one centred row when empty. `data` must be stable (memoised or from the query cache).
 */
export function DataTable<T>({
  label,
  columns,
  data,
  emptyMessage,
  loading = false,
  className,
}: {
  label: string
  columns: DataColumn<T>[]
  data: T[]
  emptyMessage: string
  loading?: boolean
  className?: string
}) {
  const table = useTable({ features: dataTableFeatures, columns, data })
  const rows = table.getRowModel().rows
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card shadow-card', className)}>
      <Table aria-label={label} aria-busy={loading} className="min-w-[560px]">
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'h-auto bg-muted px-2.5 py-[11px] text-[11.5px] font-semibold tracking-wider text-faint uppercase',
                    metaClass(header.column.columnDef.meta),
                  )}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            LOADING_ROWS.map((i) => (
              <TableRow key={i}>
                {columns.map((_column, j) => (
                  <TableCell key={j} className="px-2.5 py-[13px]">
                    <Skeleton className="h-4 w-full max-w-32" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="py-[26px] text-center text-[13.5px] text-faint">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted">
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn('px-2.5 py-[13px] text-[13.5px] whitespace-normal', metaClass(cell.column.columnDef.meta))}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
```

`src/ui/SearchField.tsx`:

```tsx
import type { ComponentProps } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/ui/input'

/** Toolbar search box (wireframe `.field-inline`): leading search icon, accessible label. */
export function SearchField({ label, className, ...props }: Omit<ComponentProps<'input'>, 'type'> & { label: string }) {
  return (
    <div className={cn('relative min-w-[200px] flex-1', className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
      <Input type="search" aria-label={label} className="pl-9" {...props} />
    </div>
  )
}
```

`src/ui/Toolbar.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Button } from '@/ui/button'

/** Filter row above a table (DESIGN.md §5): filters, spacer, Clear filters. */
export function Toolbar({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
      {children}
      <div className="flex-1" />
      <Button variant="outline" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  )
}
```

`src/ui/QueryError.tsx`:

```tsx
import { Button } from '@/ui/button'

export const LOAD_ERROR = "We couldn't load this information. Please try again."

/** Shown in place of data when a read fails. Server Logic only ever returns this safe message anyway. */
export function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-[13.5px] text-destructive">
      <span>{LOAD_ERROR}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
```

`src/ui/SectionCard.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/ui/card'

/** Wireframe `.card` with its uppercase `h2`. */
export function SectionCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('mb-5 gap-0 rounded-xl p-[18px] shadow-card', className)}>
      <h2 className="mb-3.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </Card>
  )
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/ui` then `npm run lint`
Expected: PASS; no type errors. If `table.FlexRender` or `ColumnDef` typing differs in the installed 9.2.4, check `node_modules/@tanstack/react-table/dist/useTable.d.ts` and Context7 `/tanstack/table` before changing the shape.

- [ ] **Step 6: Commit**

```bash
git add src/ui package.json package-lock.json
git commit -m "S2-02/S2-19: list kit — DataTable (TanStack Table v9), StatusPill, SearchField, Toolbar, QueryError, SectionCard; shadcn card/table/tooltip/alert

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: DTOs and dev-server fixtures

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/mocks/index.ts`
- Test: `src/api/serverLogic.test.ts` (dev-server block)

**Interfaces:**
- Produces: `SiteDto`, `PortalContactDto`, `CompanyDto` (extended), `AnnouncementDto` in `@/api/types`; mocks `sites`, `company` (with contacts); `webApiMocks.chp_announcements` in `@/mocks`.

- [ ] **Step 1: Write the failing tests** — add inside `describe('on the dev server', …)` in `src/api/serverLogic.test.ts`:

```ts
  test('serves the sites fixture from the wireframe SITES', async () => {
    const sites = await serverLogic<SiteDto[]>('sites')
    expect(sites.map((s) => s.code)).toEqual(['PLANT1', 'PLANT2', 'PLANT3'])
    expect(sites[0].isDefault).toBe(true)
  })

  test('the company fixture carries the wireframe PORTAL_CONTACTS', async () => {
    const company = await serverLogic<CompanyDto>('company')
    expect(company.website).toBe('www.jdsantoshardware.ph')
    expect(company.contacts.map((c) => c.name)).toEqual(['J.D. Santos', 'Elena Ramos', 'Miguel Torres', 'Grace Villanueva'])
  })
```

and change the import line to `import type { CompanyDto, MeDto, SiteDto } from './types'`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/api/serverLogic.test.ts`
Expected: FAIL — `No mock for Server Logic "sites"`; `company.website` undefined.

- [ ] **Step 3: Extend the DTOs** — in `src/api/types.ts`, replace `CompanyDto` and append:

```ts
/** GET /_api/serverlogics/company. Mirrors the wireframe's ACCOUNTS[] and PORTAL_CONTACTS[]. */
export interface CompanyDto {
  customerNo: string
  customerName: string
  address: string
  /** "" until BC exposes a website on the customer card. */
  website: string
  vatRegNumber: string
  phone: string
  email: string
  contacts: PortalContactDto[]
}

/** BC person contact of the customer, merged with portal activation and web role. */
export interface PortalContactDto {
  name: string
  title: string
  phone: string
  email: string
  /** Activated on this account + a business web role + BC customerPortalAccess. */
  portalAccess: boolean
  /** Highest business web role; "" when portalAccess is false. */
  portalRole: string
  isYou: boolean
}

/** GET /_api/serverlogics/sites. Mirrors the wireframe's SITES[]. */
export interface SiteDto {
  code: string
  name: string
  address: string
  city: string
  contact: string
  phone: string
  email: string
  isDefault: boolean
}

/** Dashboard banner (Dataverse chp_announcement, newest active row). Mirrors the wireframe's ANNOUNCEMENT. */
export interface AnnouncementDto {
  title: string
  message: string
}
```

- [ ] **Step 4: Add the fixtures** — in `src/mocks/index.ts`, change the import to `import type { CompanyDto, MeDto, SiteDto } from '@/api/types'`, replace the `company` mock, and add `sites` plus `webApiMocks`:

```ts
  // Wireframe ACCOUNTS[0] + PORTAL_CONTACTS
  company: (): CompanyDto => ({
    customerNo: '10482',
    customerName: 'J.D. Santos Hardware & Construction Supply',
    address: 'Blk 12 Lot 4, National Highway, Brgy. San Isidro, Cabuyao, Laguna',
    website: 'www.jdsantoshardware.ph',
    vatRegNumber: '123-456-789-000',
    phone: '0917 552 6613',
    email: 'jd.santos@sample-customer.ph',
    contacts: [
      { name: 'J.D. Santos', title: 'Owner', phone: '0917 552 6613', email: 'jd.santos@sample-customer.ph', portalAccess: true, portalRole: 'Full Access', isYou: true },
      { name: 'Elena Ramos', title: 'Purchasing Manager', phone: '0917 552 6614', email: 'elena.ramos@sample-customer.ph', portalAccess: true, portalRole: 'Orders & Delivery', isYou: false },
      { name: 'Miguel Torres', title: 'Accounting Staff', phone: '0917 552 6615', email: 'miguel.torres@sample-customer.ph', portalAccess: true, portalRole: 'Finance & Documents', isYou: false },
      { name: 'Grace Villanueva', title: 'Site Engineer', phone: '0917 552 6616', email: 'grace.villanueva@sample-customer.ph', portalAccess: false, portalRole: '', isYou: false },
    ],
  }),
  // Wireframe SITES
  sites: (): SiteDto[] => [
    { code: 'PLANT1', name: 'Plant 1 — Main Yard', address: 'Km 19 Marcos Highway, Brgy. San Roque', city: 'Antipolo City, Rizal', contact: 'Ramon Cruz', phone: '(02) 8531-4420', email: 'ramon.cruz@sample-customer.ph', isDefault: true },
    { code: 'PLANT2', name: 'Plant 2 — North Depot', address: 'National Highway, Brgy. Sta. Cruz', city: 'Angat, Bulacan', contact: 'Ligaya Fernandez', phone: '(044) 815-2207', email: '', isDefault: false },
    { code: 'PLANT3', name: 'Plant 3 — Warehouse A', address: 'Governor’s Drive, Brgy. Zone IV', city: 'Dasmariñas, Cavite', contact: 'Noel Bautista', phone: '(046) 402-7788', email: '', isDefault: false },
  ],
}

/** Dev-server answers for the Power Pages Web API, by entity set name (rows as the API returns them). */
export const webApiMocks: Record<string, (() => unknown[]) | undefined> = {
  // Wireframe ANNOUNCEMENT
  chp_announcements: () => [
    {
      chp_title: 'Holiday order cutoff schedule',
      chp_message: 'Submit orders before 3:00 PM to lock in next-business-day confirmation over the upcoming holiday period.',
    },
  ],
}
```

(The closing `}` of `mocks` moves to just after `sites`; keep the existing `me` mock unchanged.)

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/api` then `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/mocks/index.ts src/api/serverLogic.test.ts
git commit -m "S2-02/S2-14/S2-19: SiteDto, PortalContactDto, AnnouncementDto; dev fixtures from the wireframe SITES, PORTAL_CONTACTS, ANNOUNCEMENT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Delivery Sites page

**Files:**
- Create: `src/modules/sites/filterSites.ts`, `src/modules/sites/useSites.ts`, `src/modules/sites/SitesPage.tsx`
- Modify: `src/layout/SectionRoute.tsx`
- Test: `src/modules/sites/filterSites.test.ts`, `src/modules/sites/SitesPage.test.tsx`

**Interfaces:**
- Consumes: `serverLogic`, `SiteDto`, `DataTable`, `DataColumn`, `StatusPill`, `SearchField`, `Toolbar`, `QueryError`, `SectionCard`, `PageHeader`, `usePageTitle`.
- Produces: `filterSites(sites: SiteDto[], query: string): SiteDto[]`; `useSites()`; `SitesPage` (named export); `SectionRoute` lazily renders module pages from a `PAGES` map (Tasks 7 and 9 add entries).

- [ ] **Step 1: Write the failing tests**

`src/modules/sites/filterSites.test.ts`:

```ts
import type { SiteDto } from '@/api/types'
import { filterSites } from './filterSites'

const site = (code: string, name: string, city: string): SiteDto => ({ code, name, city, address: '', contact: '', phone: '', email: '', isDefault: false })
const SITES = [site('PLANT1', 'Plant 1 — Main Yard', 'Antipolo City, Rizal'), site('PLANT2', 'Plant 2 — North Depot', 'Angat, Bulacan')]

test.each([
  ['code', 'plant2', ['PLANT2']],
  ['name', 'main yard', ['PLANT1']],
  ['city', 'BULACAN', ['PLANT2']],
  ['trimmed query', '  antipolo  ', ['PLANT1']],
  ['no match', 'cebu', []],
  ['blank query', '   ', ['PLANT1', 'PLANT2']],
])('matches by %s', (_case, query, codes) => {
  expect(filterSites(SITES, query).map((s) => s.code)).toEqual(codes)
})
```

`src/modules/sites/SitesPage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import { renderApp } from '@/test/render'
import { SitesPage } from './SitesPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const table = () => screen.findByRole('table', { name: 'Active delivery sites' })

test("shows the account's delivery sites in the wireframe columns, with the default flagged", async () => {
  renderApp(<SitesPage />)
  const sites = await table()
  expect(within(sites).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Ship-to Address Code', 'Address', 'Contact', 'Phone', 'Default',
  ])
  const plant1 = within(sites).getByRole('row', { name: /PLANT1/ })
  expect(within(plant1).getByText('Plant 1 — Main Yard')).toBeInTheDocument()
  expect(within(plant1).getByText('Default')).toBeInTheDocument()
  expect(within(within(sites).getByRole('row', { name: /PLANT2/ })).queryByText('Default')).not.toBeInTheDocument()
  expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 3 delivery sites.')
  expect(document.title).toBe('Delivery Sites — Concreat Connect')
})

test('search narrows the list and Clear filters brings it back', async () => {
  const user = userEvent.setup()
  renderApp(<SitesPage />)
  await table()
  await user.type(screen.getByRole('searchbox', { name: 'Search delivery sites' }), 'bulacan')
  expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 delivery sites.')
  expect(screen.queryByRole('row', { name: /PLANT1/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByRole('searchbox', { name: 'Search delivery sites' })).toHaveValue('')
  expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 3 delivery sites.')
})

test('a search with no match says so', async () => {
  const user = userEvent.setup()
  renderApp(<SitesPage />)
  await table()
  await user.type(screen.getByRole('searchbox', { name: 'Search delivery sites' }), 'cebu')
  expect(screen.getByRole('cell', { name: 'No delivery sites match your search.' })).toBeInTheDocument()
})

test('an account without ship-tos says none are registered', async () => {
  vi.mocked(serverLogic).mockResolvedValueOnce([])
  renderApp(<SitesPage />)
  expect(await screen.findByRole('cell', { name: 'No delivery sites are registered on your account yet.' })).toBeInTheDocument()
})

test('a failed load shows the error and Try again reloads', async () => {
  const user = userEvent.setup()
  vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(500, 'x'))
  renderApp(<SitesPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await table()).toBeInTheDocument()
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/modules/sites`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/modules/sites/filterSites.ts`:

```ts
import type { SiteDto } from '@/api/types'

/** Wireframe search: site code, name or city, case-insensitive. A blank query keeps every site. */
export function filterSites(sites: SiteDto[], query: string): SiteDto[] {
  const q = query.trim().toLowerCase()
  if (!q) return sites
  return sites.filter((site) => [site.code, site.name, site.city].some((value) => value.toLowerCase().includes(q)))
}
```

`src/modules/sites/useSites.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { SiteDto } from '@/api/types'

/** The account's BC ship-to addresses. Cached for minutes (Architecture §6). */
export function useSites() {
  return useQuery({ queryKey: ['sites'], queryFn: () => serverLogic<SiteDto[]>('sites'), staleTime: 5 * 60_000 })
}
```

`src/modules/sites/SitesPage.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type { SiteDto } from '@/api/types'
import { usePageTitle } from '@/lib/usePageTitle'
import { DataTable, type DataColumn } from '@/ui/DataTable'
import { PageHeader } from '@/ui/PageHeader'
import { QueryError } from '@/ui/QueryError'
import { SearchField } from '@/ui/SearchField'
import { SectionCard } from '@/ui/SectionCard'
import { StatusPill } from '@/ui/StatusPill'
import { Toolbar } from '@/ui/Toolbar'
import { filterSites } from './filterSites'
import { useSites } from './useSites'

const NO_SITES: SiteDto[] = []

// Wireframe Delivery Sites table. The row action ("Request a change") arrives with S4-06.
const columns: DataColumn<SiteDto>[] = [
  {
    id: 'code',
    header: 'Ship-to Address Code',
    cell: ({ row }) => (
      <>
        <span className="font-mono">{row.original.code}</span>
        <br />
        <span className="text-xs text-faint">{row.original.name}</span>
      </>
    ),
  },
  {
    id: 'address',
    header: 'Address',
    cell: ({ row }) => (
      <>
        {row.original.address}
        <br />
        {row.original.city}
      </>
    ),
  },
  { id: 'contact', header: 'Contact', cell: ({ row }) => row.original.contact },
  { id: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone, meta: { className: 'font-mono' } },
  { id: 'default', header: 'Default', cell: ({ row }) => (row.original.isDefault ? <StatusPill tone="good">Default</StatusPill> : null) },
]

export function SitesPage() {
  usePageTitle('Delivery Sites')
  const sites = useSites()
  const [query, setQuery] = useState('')
  const all = sites.data ?? NO_SITES
  const shown = useMemo(() => filterSites(all, query), [all, query])

  return (
    <>
      <PageHeader title="Delivery Sites" />
      <SectionCard title="Active Delivery Sites">
        <Toolbar onClear={() => setQuery('')}>
          <SearchField
            label="Search delivery sites"
            placeholder="Search site name, code, or city"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-[280px]"
          />
        </Toolbar>
        {sites.isError ? (
          <QueryError onRetry={() => void sites.refetch()} />
        ) : (
          <>
            <p className="mb-3.5 text-xs text-faint">
              Showing <strong>{shown.length}</strong> delivery sites.
            </p>
            <DataTable
              label="Active delivery sites"
              columns={columns}
              data={shown}
              loading={sites.isPending}
              emptyMessage={query.trim() ? 'No delivery sites match your search.' : 'No delivery sites are registered on your account yet.'}
              className="shadow-none"
            />
          </>
        )}
      </SectionCard>
    </>
  )
}
```

`src/layout/SectionRoute.tsx` (whole file):

```tsx
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { Navigate } from 'react-router-dom'
import { canSee } from '@/auth/access'
import { useMe } from '@/auth/useMe'
import type { Section, SectionKey } from '@/layout/sections'
import { Placeholder } from '@/modules/Placeholder'

// Built modules, one chunk each. Sections not listed here show the placeholder until their sub-project lands.
const PAGES: Partial<Record<SectionKey, LazyExoticComponent<ComponentType>>> = {
  sites: lazy(() => import('@/modules/sites/SitesPage').then((m) => ({ default: m.SitesPage }))),
}

/** UX-only guard. AppShell renders routes only once `me` has loaded; Server Logic web roles are the security. */
export function SectionRoute({ section }: { section: Section }) {
  const { data } = useMe()
  if (!data || !canSee(data.roles, section.key)) return <Navigate to="/" replace />
  const Page = PAGES[section.key]
  if (!Page) return <Placeholder label={section.label} />
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/modules/sites src/layout src/App.test.tsx`
Expected: PASS (AppShell/App tests still find the placeholders' headings).

- [ ] **Step 5: Commit**

```bash
git add src/modules/sites src/layout/SectionRoute.tsx
git commit -m "S2-02: Delivery Sites — Active Delivery Sites list (wireframe columns, default pill, search, count, empty and error states)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Account and User Management page

**Files:**
- Create: `src/modules/account/useCompany.ts`, `src/modules/account/AccountPage.tsx`
- Modify: `src/layout/SectionRoute.tsx` (`PAGES` entry)
- Test: `src/modules/account/AccountPage.test.tsx`

**Interfaces:**
- Consumes: `serverLogic`, `CompanyDto`, `PortalContactDto`, kit from Task 4, `canSee`, `SECTIONS`, `Tooltip`/`TooltipTrigger`/`TooltipContent` from `@/ui/tooltip`.
- Produces: `useCompany()`; `AccountPage` (named export); `canSeeLabels(role: string): string[]` (exported from `AccountPage.tsx` for the tooltip).

- [ ] **Step 1: Write the failing test** — `src/modules/account/AccountPage.test.tsx`

```tsx
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { CompanyDto } from '@/api/types'
import { renderApp } from '@/test/render'
import { AccountPage } from './AccountPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

test('shows the company information from BC', async () => {
  renderApp(<AccountPage />)
  await screen.findByText('10482')
  // dt/dd pairs: read each term with the definition that follows it.
  const pairs = screen.getAllByRole('term')
  expect(pairs.map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])).toEqual([
    ['Customer Number', '10482'],
    ['Company Name', 'J.D. Santos Hardware & Construction Supply'],
    ['Address', 'Blk 12 Lot 4, National Highway, Brgy. San Isidro, Cabuyao, Laguna'],
    ['Website', 'www.jdsantoshardware.ph'],
    ['VAT Registration Number', '123-456-789-000'],
  ])
  expect(document.title).toBe('Account and User Management — Concreat Connect')
})

test('a missing website shows a dash', async () => {
  const actual = (await vi.importActual<typeof import('@/mocks')>('@/mocks')).mocks.company!({ method: 'GET' }) as CompanyDto
  vi.mocked(serverLogic).mockResolvedValueOnce({ ...actual, website: '' })
  renderApp(<AccountPage />)
  const website = (await screen.findAllByRole('term')).find((dt) => dt.textContent === 'Website')!
  expect(website.nextElementSibling).toHaveTextContent('—')
})

test('lists contacts with You, portal access and permissions as in the wireframe', async () => {
  renderApp(<AccountPage />)
  const contacts = await screen.findByRole('table', { name: 'Contacts and portal access' })
  expect(within(contacts).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Name', 'Title', 'Phone', 'Email', 'Portal access', 'Permissions', 'Actions',
  ])
  const you = within(contacts).getByRole('row', { name: /J\.D\. Santos/ })
  expect(within(you).getByText('You')).toBeInTheDocument()
  expect(within(you).getByText('Yes')).toBeInTheDocument()
  expect(within(you).getByText('Full Access')).toBeInTheDocument()
  const grace = within(contacts).getByRole('row', { name: /Grace Villanueva/ })
  expect(within(grace).getByText('No')).toBeInTheDocument()
  expect(within(grace).queryByText('You')).not.toBeInTheDocument()
  expect(within(grace).getAllByText('—')).toHaveLength(2) // Permissions and Actions
})

test("hovering a role lists the sections it can see", async () => {
  const user = userEvent.setup()
  renderApp(<AccountPage />)
  await user.hover(await screen.findByText('Finance & Documents'))
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'Can see: Dashboard, Customer Ledger, Document Center, Account and User Management',
  )
})

test('an account without contacts says none are registered', async () => {
  const actual = (await vi.importActual<typeof import('@/mocks')>('@/mocks')).mocks.company!({ method: 'GET' }) as CompanyDto
  vi.mocked(serverLogic).mockResolvedValueOnce({ ...actual, contacts: [] })
  renderApp(<AccountPage />)
  expect(await screen.findByRole('cell', { name: 'No contacts are registered on your account yet.' })).toBeInTheDocument()
})

test('a failed load shows the error and Try again reloads', async () => {
  const user = userEvent.setup()
  vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(500, 'x'))
  renderApp(<AccountPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('table', { name: 'Contacts and portal access' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/account`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/modules/account/useCompany.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { CompanyDto } from '@/api/types'

/** The account's BC customer card and contacts with portal access. */
export function useCompany() {
  return useQuery({ queryKey: ['company'], queryFn: () => serverLogic<CompanyDto>('company'), staleTime: 5 * 60_000 })
}
```

`src/modules/account/AccountPage.tsx`:

```tsx
import type { PortalContactDto } from '@/api/types'
import { canSee } from '@/auth/access'
import { SECTIONS } from '@/layout/sections'
import { usePageTitle } from '@/lib/usePageTitle'
import { DataTable, type DataColumn } from '@/ui/DataTable'
import { PageHeader } from '@/ui/PageHeader'
import { QueryError } from '@/ui/QueryError'
import { SectionCard } from '@/ui/SectionCard'
import { Skeleton } from '@/ui/skeleton'
import { StatusPill } from '@/ui/StatusPill'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { useCompany } from './useCompany'

const NO_CONTACTS: PortalContactDto[] = []

/** Section labels a web role can open, in nav order (the wireframe's "Can see: …" hint). */
export function canSeeLabels(role: string): string[] {
  return SECTIONS.filter((section) => canSee([role], section.key)).map((section) => section.label)
}

// Wireframe Contacts & Portal Access table. View-only for Nov 15; Revoke arrives with S4-08.
const columns: DataColumn<PortalContactDto>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <>
        {row.original.name}
        {row.original.isYou && <StatusPill className="ml-1.5">You</StatusPill>}
      </>
    ),
  },
  { id: 'title', header: 'Title', cell: ({ row }) => row.original.title },
  { id: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone, meta: { className: 'font-mono' } },
  { id: 'email', header: 'Email', cell: ({ row }) => row.original.email },
  {
    id: 'access',
    header: 'Portal access',
    cell: ({ row }) => (row.original.portalAccess ? <StatusPill tone="good">Yes</StatusPill> : <StatusPill>No</StatusPill>),
  },
  {
    id: 'permissions',
    header: 'Permissions',
    cell: ({ row }) =>
      row.original.portalAccess ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <StatusPill tabIndex={0}>{row.original.portalRole}</StatusPill>
          </TooltipTrigger>
          <TooltipContent>Can see: {canSeeLabels(row.original.portalRole).join(', ')}</TooltipContent>
        </Tooltip>
      ) : (
        '—'
      ),
  },
  { id: 'actions', header: 'Actions', cell: () => '—' },
]

export function AccountPage() {
  usePageTitle('Account and User Management')
  const company = useCompany()
  const data = company.data

  if (company.isError) {
    return (
      <>
        <PageHeader title="Account and User Management" />
        <QueryError onRetry={() => void company.refetch()} />
      </>
    )
  }

  const fields: [string, string | undefined, boolean][] = [
    ['Customer Number', data?.customerNo, true],
    ['Company Name', data?.customerName, false],
    ['Address', data?.address, false],
    ['Website', data?.website, false],
    ['VAT Registration Number', data?.vatRegNumber, true],
  ]

  return (
    <>
      <PageHeader title="Account and User Management" />
      <SectionCard title="Company Information">
        <dl className="grid grid-cols-1 gap-x-5 gap-y-2.5 rounded-lg bg-muted px-4 py-3.5 sm:grid-cols-2">
          {fields.map(([label, value, mono]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-semibold tracking-wider text-faint uppercase">{label}</dt>
              <dd className={mono ? 'font-mono text-[13.5px]' : 'text-[13.5px]'}>
                {data ? value || '—' : <Skeleton className="h-4 w-40" />}
              </dd>
            </div>
          ))}
        </dl>
      </SectionCard>
      <SectionCard title="Contacts & Portal Access">
        <DataTable
          label="Contacts and portal access"
          columns={columns}
          data={data?.contacts ?? NO_CONTACTS}
          loading={company.isPending}
          emptyMessage="No contacts are registered on your account yet."
          className="shadow-none"
        />
      </SectionCard>
    </>
  )
}
```

If `src/ui/tooltip.tsx` from shadcn doesn't wrap `Tooltip` in a `TooltipProvider`, wrap the `<DataTable>` above in `<TooltipProvider>` (import it from `@/ui/tooltip`).

Add to `PAGES` in `src/layout/SectionRoute.tsx`:

```tsx
  account: lazy(() => import('@/modules/account/AccountPage').then((m) => ({ default: m.AccountPage }))),
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/modules/account src/layout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/account src/layout/SectionRoute.tsx
git commit -m "S2-19: Account and User Management — Company Information and Contacts & Portal Access (You, Yes/No, role with Can see tooltip), view-only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Announcement table, permissions and Web API settings (Dataverse + site metadata)

**Files:**
- Modify: `scripts/dataverse/identity_schema.py` (main guard so its helpers can be imported)
- Create: `scripts/dataverse/announcement_schema.py`
- Modify: `scripts/dataverse/admin_role.py` (privileges)
- Create (scripts): `.powerpages-site/table-permissions/Announcement-read-(global).tablepermission.yml`, `.powerpages-site/site-settings/Webapi-chp_announcement-enabled.sitesetting.yml`, `.powerpages-site/site-settings/Webapi-chp_announcement-fields.sitesetting.yml`
- Modify: `docs/runbooks/portal-access.md` (announcement section)

**Interfaces:**
- Produces: Dataverse table `chp_announcement` (entity set `chp_announcements`; columns `chp_title`, `chp_message`, `chp_active`) readable through `/_api/chp_announcements` by Authenticated Users, columns `chp_title,chp_message,chp_active,modifiedon`.

- [ ] **Step 1: Ask the user before any Dataverse write.** This creates a table in `ConcreatHub` in Dev and changes the Concreat Connect Admin role.

- [ ] **Step 2: Make the identity helpers importable.** In `scripts/dataverse/identity_schema.py`, move everything from `print('Account columns')` to the end into a function and guard it:

```python
def main():
    print('Account columns')
    # … the existing statements, indented one level, unchanged …
    print('Done.')


if __name__ == '__main__':
    main()
```

Run: `python -c "import sys; sys.path.insert(0, 'scripts/dataverse'); import identity_schema"` from the repo root
Expected: no output (nothing runs on import).

- [ ] **Step 3: Write the announcement schema script** — `scripts/dataverse/announcement_schema.py`

```python
"""S2-14 Dashboard announcement table in ConcreatHub. Idempotent. Dev only.

The newest row with Active = Yes is shown on the Dashboard; no active row means no banner.
Usage (from the repo root): python scripts/dataverse/announcement_schema.py
"""
from dv import label, required
from identity_schema import dv, ensure_attribute, ensure_table, text

print('Announcement')
ensure_table('chp_Announcement', 'Announcement', 'Announcements',
             'Dashboard banner (S2-14). The newest active row is shown to every signed-in customer.',
             text('chp_Title', 'Title', 200, is_required=True, primary=True))
ensure_attribute('chp_announcement', {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', 'SchemaName': 'chp_Message',
    'DisplayName': label('Message'), 'RequiredLevel': required(False), 'MaxLength': 2000})
ensure_attribute('chp_announcement', {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', 'SchemaName': 'chp_Active',
    'DisplayName': label('Active'), 'RequiredLevel': required(False), 'DefaultValue': False,
    'OptionSet': {'@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
                  'TrueOption': {'Value': 1, 'Label': label('Yes')},
                  'FalseOption': {'Value': 0, 'Label': label('No')}}})

print('Publishing')
dv.post('PublishXml', {'ParameterXml': '<importexportxml><entities><entity>chp_announcement</entity></entities></importexportxml>'})
print('Done.')
```

- [ ] **Step 4: Give the admin role access.** In `scripts/dataverse/admin_role.py`, add to `PRIVILEGES`:

```python
    ('prvCreatechp_announcement', 'Global'), ('prvReadchp_announcement', 'Global'),
    ('prvWritechp_announcement', 'Global'), ('prvDeletechp_announcement', 'Global'),
```

- [ ] **Step 5: Run both scripts** (after the user's yes)

Run: `python scripts/dataverse/announcement_schema.py` then `python scripts/dataverse/admin_role.py`
Expected: `+ table chp_announcement`, `+ chp_announcement.chp_message`, `+ chp_announcement.chp_active`, `Done.`; then `= 12 privileges set`. A second run prints `=` lines only.

- [ ] **Step 6: Generate the portal metadata**

```bash
node "$PP/create-table-permission.js" --projectRoot . --permissionName "Announcement - read (global)" --tableName chp_announcement \
  --webRoleIds b2780841-e908-44f8-b7d8-dfd367bfeeb2 --scope Global --read
node "$PP/create-site-setting.js" --projectRoot . --name "Webapi/chp_announcement/enabled" --value true \
  --description "S2-14: Dashboard announcement is read through the Web API" --type boolean
node "$PP/create-site-setting.js" --projectRoot . --name "Webapi/chp_announcement/fields" --value "chp_title,chp_message,chp_active,modifiedon" \
  --description "S2-14: announcement columns the SPA reads (modifiedon for ordering)"
```
Expected: three new YAML files; the permission has `scope: 756150000`, `read: true`, only the Authenticated Users role.

- [ ] **Step 7: Add the table to the admin app (maker portal, by hand).** make.powerapps.com → Dev environment → Solutions → ConcreatHub → Concreat Connect Admin → Edit → **Add page** → Dataverse table → **Announcement** → Save → Publish. Ask the user to do this if no browser automation is available, and wait for confirmation.

- [ ] **Step 8: Document it for ops** — append to `docs/runbooks/portal-access.md`:

```markdown
## Dashboard announcement

1. Open **Concreat Connect Admin** → **Announcements** → **New**.
2. Enter a **Title** and **Message**, set **Active** to **Yes**, then **Save**.
3. Every signed-in customer sees it at the top of the Dashboard within 5 minutes. If several are active, the most recently changed one is shown.
4. To remove it, set **Active** to **No** (or delete the record). With no active announcement, no banner is shown.
```

- [ ] **Step 9: Commit**

```bash
git add scripts/dataverse/identity_schema.py scripts/dataverse/announcement_schema.py scripts/dataverse/admin_role.py .powerpages-site/table-permissions .powerpages-site/site-settings docs/runbooks/portal-access.md
git commit -m "S2-14: chp_announcement table (title, message, active) in ConcreatHub, admin role access, global read permission and Web API settings; ops runbook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Web API client and Dashboard announcement banner

**Files:**
- Create: `src/api/webApi.ts`, `src/api/webApi.test.ts`
- Create: `src/modules/dashboard/useAnnouncement.ts`, `src/modules/dashboard/AnnouncementBanner.tsx`, `src/modules/dashboard/DashboardPage.tsx`
- Modify: `src/layout/SectionRoute.tsx` (`PAGES` entry)
- Test: `src/modules/dashboard/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `ApiError`, `GENERIC_ERROR` from `@/api/serverLogic`; `fetchAntiForgeryToken` from `@/auth/session`; `webApiMocks` from `@/mocks`; `AnnouncementDto`; `Alert`, `AlertTitle`, `AlertDescription` from `@/ui/alert`.
- Produces: `webApiGet<T>(entitySet: string, query: string): Promise<T[]>`; `useAnnouncement()` → `AnnouncementDto | null`; `DashboardPage`.

- [ ] **Step 1: Write the failing tests**

`src/api/webApi.test.ts`:

```ts
import { ApiError, GENERIC_ERROR } from './serverLogic'
import { webApiGet } from './webApi'

test('on the dev server it answers from the Web API mocks', async () => {
  const rows = await webApiGet<{ chp_title: string }>('chp_announcements', '$top=1')
  expect(rows[0].chp_title).toBe('Holiday order cutoff schedule')
})

describe('on the deployed site', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
  })

  function stubFetch(response: Response) {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/_layout/tokenhtml' ? new Response('<input type="hidden" value="tok123" />') : response,
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  test('GETs /_api/<entitySet>?<query> with the CSRF headers and returns value[]', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ value: [{ chp_title: 'Hi' }] })))
    expect(await webApiGet('chp_announcements', '$select=chp_title&$top=1')).toEqual([{ chp_title: 'Hi' }])
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/_api/chp_announcements?$select=chp_title&$top=1')
    const headers = new Headers(init?.headers)
    expect(headers.get('__RequestVerificationToken')).toBe('tok123')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
    expect(headers.get('Accept')).toBe('application/json')
  })

  test('a failed call throws ApiError with the generic message', async () => {
    stubFetch(new Response('{"error":{"message":"Forbidden"}}', { status: 403 }))
    const error = (await webApiGet('chp_announcements', '').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(403)
    expect(error.message).toBe(GENERIC_ERROR)
  })
})
```

`src/modules/dashboard/DashboardPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { ApiError } from '@/api/serverLogic'
import { webApiGet } from '@/api/webApi'
import { renderApp } from '@/test/render'
import { DashboardPage } from './DashboardPage'

vi.mock('@/api/webApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/webApi')>()
  return { ...actual, webApiGet: vi.fn(actual.webApiGet) }
})

test('shows the active announcement above the Dashboard', async () => {
  renderApp(<DashboardPage />)
  const banner = await screen.findByRole('alert')
  expect(banner).toHaveTextContent('Announcement')
  expect(banner).toHaveTextContent('Holiday order cutoff schedule')
  expect(banner).toHaveTextContent('Submit orders before 3:00 PM')
  expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  expect(document.title).toBe('Dashboard — Concreat Connect')
})

test('reads only the newest active announcement', async () => {
  renderApp(<DashboardPage />)
  await screen.findByRole('alert')
  expect(vi.mocked(webApiGet)).toHaveBeenCalledWith(
    'chp_announcements',
    '$select=chp_title,chp_message&$filter=chp_active eq true&$orderby=modifiedon desc&$top=1',
  )
})

test.each([
  ['there is no active announcement', () => vi.mocked(webApiGet).mockResolvedValueOnce([])],
  ['the announcement has no title', () => vi.mocked(webApiGet).mockResolvedValueOnce([{ chp_title: null, chp_message: 'x' }])],
  ['the read fails', () => vi.mocked(webApiGet).mockRejectedValueOnce(new ApiError(403, 'x'))],
])('no banner when %s, and the Dashboard still loads', async (_case, arrange) => {
  arrange()
  renderApp(<DashboardPage />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/api/webApi.test.ts src/modules/dashboard`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/api/webApi.ts`:

```ts
import { fetchAntiForgeryToken } from '@/auth/session'
import { webApiMocks } from '@/mocks'
import { ApiError, GENERIC_ERROR } from './serverLogic'

/**
 * GET from the Power Pages Web API (portal-owned Dataverse tables; table permissions decide what comes back).
 * `query` is the OData query string without the leading "?". On the dev server it answers from src/mocks.
 */
export async function webApiGet<T>(entitySet: string, query: string): Promise<T[]> {
  if (import.meta.env.DEV) {
    const mock = webApiMocks[entitySet]
    if (!mock) throw new ApiError(404, `No mock for Web API "${entitySet}"`)
    return mock() as T[]
  }
  const response = await fetch(`/_api/${entitySet}?${query}`, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      __RequestVerificationToken: await fetchAntiForgeryToken(),
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!response.ok) throw new ApiError(response.status, GENERIC_ERROR)
  return ((await response.json()) as { value: T[] }).value
}
```

`src/modules/dashboard/useAnnouncement.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import type { AnnouncementDto } from '@/api/types'
import { webApiGet } from '@/api/webApi'

interface AnnouncementRow {
  chp_title: string | null
  chp_message: string | null
}

/** The newest active announcement, or null. Ops changes show within 5 minutes. */
export function useAnnouncement() {
  return useQuery({
    queryKey: ['announcement'],
    queryFn: async (): Promise<AnnouncementDto | null> => {
      const [row] = await webApiGet<AnnouncementRow>(
        'chp_announcements',
        '$select=chp_title,chp_message&$filter=chp_active eq true&$orderby=modifiedon desc&$top=1',
      )
      return row?.chp_title ? { title: row.chp_title, message: row.chp_message ?? '' } : null
    },
    staleTime: 5 * 60_000,
  })
}
```

`src/modules/dashboard/AnnouncementBanner.tsx`:

```tsx
import { Alert, AlertDescription, AlertTitle } from '@/ui/alert'
import { useAnnouncement } from './useAnnouncement'

/** Wireframe announcement banner (DESIGN.md §5). Renders nothing when there's no active announcement or the read fails. */
export function AnnouncementBanner() {
  const { data } = useAnnouncement()
  if (!data) return null
  return (
    <Alert className="mb-5 block rounded-xl border-l-4 border-l-primary bg-accent px-5 py-4">
      <p className="mb-1 text-[11px] font-bold tracking-wider text-accent-foreground uppercase">Announcement</p>
      <AlertTitle className="mb-1 text-base font-bold text-foreground">{data.title}</AlertTitle>
      <AlertDescription className="max-w-[62ch] text-[13px] text-muted-foreground">{data.message}</AlertDescription>
    </Alert>
  )
}
```

`src/modules/dashboard/DashboardPage.tsx`:

```tsx
import { usePageTitle } from '@/lib/usePageTitle'
import { PageHeader } from '@/ui/PageHeader'
import { AnnouncementBanner } from './AnnouncementBanner'

// Account overview and Sales Orders tiles arrive with S2 sub-project C.
export function DashboardPage() {
  usePageTitle('Dashboard')
  return (
    <>
      <AnnouncementBanner />
      <PageHeader title="Dashboard" caption="This section is coming soon." />
    </>
  )
}
```

Add to `PAGES` in `src/layout/SectionRoute.tsx`:

```tsx
  dashboard: lazy(() => import('@/modules/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))),
```

- [ ] **Step 4: Run the whole suite, lint and build**

Run: `npm test` then `npm run lint` then `npm run build`
Expected: all PASS; `dist/` builds with separate chunks for the three module pages.

- [ ] **Step 5: Commit**

```bash
git add src/api/webApi.ts src/api/webApi.test.ts src/modules/dashboard src/layout/SectionRoute.tsx
git commit -m "S2-14: Web API client and Dashboard announcement banner (newest active row; hidden when none or on error)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Deploy to Dev, live checks, docs

**Files:**
- Modify: `docs/Concreat_Hub_Implementation_Plan.md` (rows S2-01, S2-02, S2-12, S2-14, S2-18, S2-19)
- Modify: `docs/wording-checklist.md`
- Modify: `docs/superpowers/specs/2026-10-08-s2-a-sites-account-announcement-design.md` (anything the live checks changed)

- [ ] **Step 1: Run every check before deploying**

Run: `npm test`, `npm run lint`, `npm run build`, `node scripts/stamp-server-logic-helpers.mjs --check`
Expected: all PASS; the stamper prints nothing and exits 0.

- [ ] **Step 2: Ask the user to approve the deploy**, then confirm the target:

Run: `pac auth who`
Expected: environment `https://org380257ac.crm5.dynamics.com/` (*CHP Customer Portal*, Dev). Stop if it is anything else.

- [ ] **Step 3: Deploy**

Run: `pac pages upload-code-site --rootPath .`
Expected: upload succeeds. Then re-check the Header web template note in CLAUDE.md (redirect scripts live in Code-Site-Shell-Header, so nothing to restore).

- [ ] **Step 4: Live checks on https://chp-portal-dev.powerappsportals.com** (signed in as the Dev test users from S1-02/S1-03):
  1. Full Access and Orders & Delivery: **Delivery Sites** lists only the session customer's ship-tos; search and Clear filters work; the default pill matches BC (or none, if Task 1 found no field).
  2. Finance & Documents: `GET /_api/serverlogics/sites` returns 403 (browser devtools or `/test-site`).
  3. Every business role: **Account and User Management** shows the company card and contacts; a test contact who has activated with a role shows **Yes** + role; one without activation shows **No**. If the contacts read fails, check the Server Logic log: a Dataverse 403 on `powerpagecomponent_mspp_webrole_contact` means the coworkers' web roles need one more read permission — add the smallest one with `create-table-permission.js`, redeploy, and record it in the spec's Permissions section.
  4. Ops: create an active announcement in Concreat Connect Admin → it appears on the Dashboard (hard refresh); set Active = No → it disappears after the 5-minute cache or a new sign-in.
  5. Each page's browser tab reads "<Page> — Concreat Connect".

- [ ] **Step 5: Update the docs**
  - Plan rows: S2-02, S2-14, S2-19 → `✅ Done (Dev)` with a one-line note (date, what was verified). S2-01 / S2-18 notes: default flag and website status from Task 1. S2-12: replace "greeting (time of day + first name + company subtext)" with "no greeting (removed in mockup v2, 2026-09-29)".
  - `docs/wording-checklist.md`: add the two new empty-state lines (*No delivery sites are registered on your account yet.*, *No contacts are registered on your account yet.*) for Rene to confirm.
  - Spec: Webapi fields include `modifiedon`; `StatusPill` is a plain span (no shadcn `badge`); Account shows one `QueryError` instead of the two cards on failure; any permission added in Step 4.3.

- [ ] **Step 6: Commit**

```bash
git add docs/Concreat_Hub_Implementation_Plan.md docs/wording-checklist.md docs/superpowers/specs/2026-10-08-s2-a-sites-account-announcement-design.md
git commit -m "S2-02/S2-14/S2-19: Done (Dev) — live checks passed; plan rows, wording checklist and spec updated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`docs/wording-checklist.md` already has uncommitted user edits — show the user `git diff docs/wording-checklist.md` before staging and ask whether to include their edits in this commit (if not, use `git add -p` to stage only the two new lines).
