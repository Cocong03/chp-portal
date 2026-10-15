# Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Dashboard's Account overview and Sales Orders tiles behind one `dashboard` Server Logic — Sales Orders counts live from BC, Account overview on sample data and local-only until BC delivers balances and available credit.

**Architecture:** The Orders status filter rules move into the stamped shared helpers (`ORDER_STATUS_FILTER`) so `orders` and the new `dashboard` endpoint read one definition. `dashboard` runs 4 BC `$count` queries and the customer-card credit limit in parallel. The SPA's `DashboardPage` renders wireframe stat tiles; status tiles link to `/orders?status=…` only for roles that can open Orders.

**Tech Stack:** React 19, TypeScript, TanStack Query, react-router, Tailwind v4, Vitest + RTL, Power Pages Server Logic (plain JS, no modules).

**Spec:** `docs/superpowers/specs/2026-10-15-s2-c-dashboard-design.md`

## Global Constraints

- Customer comes only from the session (`sessionScope()`); request values are ignored. Every user value in `$filter` goes through `odataLiteral`.
- Server Logic files must not contain (even in strings/comments): `require(`, `eval(`, `setTimeout`, `delete`, `prototype`, `Reflect.`, `with(` / `with (`. `test/server-logic/bc-helpers.test.ts` scans every endpoint file.
- Shared helpers are edited only in `server-logic-src/bc-helpers.js`, then stamped with `node scripts/stamp-server-logic-helpers.mjs`.
- Web roles on `dashboard`: Full Access `56b29291-b981-4ef0-865b-41c1e9523a97`, Orders & Delivery `11bb7218-55fb-4cae-b8a1-5af2f41237c5`, Finance & Documents `c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3`, View Only `0c42c9f3-bc20-40a2-8c6a-a731a263ed83`.
- No business math in the SPA: amounts and counts come from the endpoint; the SPA only formats.
- Wireframe copy, verbatim: *Account overview*, *Outstanding Balance* / *Total outstanding on your account*, *Balance Due Today* / *Due now per your payment terms*, *Overdue amount* / *Past its due date* (default) / *Past its due date — please settle to avoid delivery holds* (overdue > 0) / *Nothing past due — account in good standing* (overdue = 0), *Credit limit* / *Set on your customer record*, *Available credit* / *Kept in sync with your live credit standing*, *Sales Orders*, *Open*, *Pending prepayment*, *Ready for dispatch*, *Completely shipped*, *Invoiced*, *View these orders →*.
- Deploy only to Dev, with `npm run deploy` (checks `pac` points at `https://org380257ac.crm5.dynamics.com/`, builds, uploads).
- The user has uncommitted edits in `CLAUDE.md, DESIGN.md, PLANS.md, docs/Concreat_Hub_Architecture.md, docs/superpowers/plans/2026-10-04-s1-spa-foundation.md, docs/wording-checklist.md, src/modules/signin/AuthLayout.tsx, src/styles/theme.css` and possibly `src/modules/orders/OrdersPage.tsx` (a `console.log`). Stage only your own changes; for `docs/wording-checklist.md` stage your row only (Task 4).
- Commit messages start with the task ID and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A count of 0 shows "0" (a real figure), not "—"; only `null` shows "—".
2. Overdue exactly ₱0.00 is green ("Nothing past due"); overdue `null` (BC not yet) is neutral with the default caption — never green.
3. "Pending Prepayment" and "Ready for Dispatch" links carry the space correctly, and the Orders page pre-selects that status from the link.
4. A role whose `me` hasn't loaded yet never sees links that then vanish: tiles become links only once `me` says the role can open Orders (no flash for Finance).
5. If `mcrmCustomers` returns no row or another customer's row, `creditLimit` is `null`, never another customer's figure.

Tests: 1 → Task 3 "a zero count…"; 2 → Task 3 overdue tests; 3 → Task 3 link test (href) + existing Orders URL-filter test; 4 → Task 3 Finance test asserts after `me` loads; 5 → Task 2 credit-limit test.

---

## File Structure

| File | Responsibility |
|---|---|
| Modify `server-logic-src/bc-helpers.js` | Add `ORDER_STATUS_FILTER` |
| Modify `.powerpages-site/server-logic/orders/orders.js` | Use `ORDER_STATUS_FILTER`; drop local `STATUS_FILTER` |
| Modify `test/server-logic/bc-helpers.test.ts` | Shared map + "no endpoint defines its own status clauses" |
| Create `.powerpages-site/server-logic/dashboard/dashboard.js`, `dashboard.serverlogic.yml` | `dashboard` GET |
| Create `test/server-logic/dashboard.test.ts` | Endpoint tests |
| Modify `src/api/types.ts` | `DashboardDto` |
| Create `src/mocks/dashboard.ts`; modify `src/mocks/index.ts` | Local mock |
| Create `src/modules/dashboard/useDashboard.ts` | Query hook |
| Create `src/modules/dashboard/StatTile.tsx` | Wireframe stat tile |
| Modify `src/modules/dashboard/DashboardPage.tsx` | Sections |
| Modify `src/modules/dashboard/DashboardPage.test.tsx` | Screen tests (and name-based mocks for the existing ones) |
| Modify `docs/Concreat_Hub_Implementation_Plan.md`, `docs/wording-checklist.md` | Docs |

---

### Task 1: Shared Orders status rules

**Files:**
- Modify: `server-logic-src/bc-helpers.js` (append before `// OData string literal…`, i.e. after `blockedError`)
- Modify: `.powerpages-site/server-logic/orders/orders.js` (the `STATUS_FILTER` block and its two uses)
- Test: `test/server-logic/bc-helpers.test.ts`

**Interfaces:**
- Produces: global `ORDER_STATUS_FILTER: Record<'Open' | 'Pending Prepayment' | 'Ready for Dispatch' | 'Completely Shipped', string>` in every stamped endpoint.

- [ ] **Step 1: Write the failing tests** — append to `test/server-logic/bc-helpers.test.ts`:

```ts
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
    const own = text.slice(0, text.indexOf(START)) + text.slice(text.indexOf(END))
    expect(own, file).not.toMatch(/completelyShipped eq/)
  }
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/server-logic/bc-helpers.test.ts`
Expected: FAIL — `ORDER_STATUS_FILTER is not defined`; `orders.js contains completelyShipped eq`.

- [ ] **Step 3: Move the rules**

In `server-logic-src/bc-helpers.js`, insert before the line `// OData string literal with single quotes doubled (architecture rule 4).`:

```js
// Portal status → mcrmSalesOrders filter clause (confirmed mapping 2026-09-14; Completely Shipped wins over Status).
// Shared so the Orders filter and the Dashboard counts can't drift. Invoiced lives in BC's archive (S2-03).
var ORDER_STATUS_FILTER = {
    "Open": "status eq 'Open' and completelyShipped eq false",
    "Pending Prepayment": "status eq 'Pending Prepayment' and completelyShipped eq false",
    "Ready for Dispatch": "status eq 'Released' and completelyShipped eq false",
    "Completely Shipped": "completelyShipped eq true"
};

```

In `.powerpages-site/server-logic/orders/orders.js` delete this block:

```js
    var STATUS_FILTER = {
        "Open": "status eq 'Open' and completelyShipped eq false",
        "Pending Prepayment": "status eq 'Pending Prepayment' and completelyShipped eq false",
        "Ready for Dispatch": "status eq 'Released' and completelyShipped eq false",
        "Completely Shipped": "completelyShipped eq true"
    };
```

and replace its two uses: `parts.push(STATUS_FILTER[status]);` → `parts.push(ORDER_STATUS_FILTER[status]);` and `Object.keys(STATUS_FILTER)` → `Object.keys(ORDER_STATUS_FILTER)`.

Run: `node scripts/stamp-server-logic-helpers.mjs` → Expected: a `stamped:` line per endpoint.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run test/server-logic`
Expected: all pass — including the unchanged `orders.test.ts` status-filter tests.

- [ ] **Step 5: Commit**

```bash
git add server-logic-src/bc-helpers.js .powerpages-site/server-logic/*/*.js test/server-logic/bc-helpers.test.ts
git commit -m "S2-11: Orders status filter rules move into the shared helpers so the Dashboard counts can't drift from the Orders filter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `dashboard` Server Logic

**Files:**
- Create: `.powerpages-site/server-logic/dashboard/dashboard.js`, `.powerpages-site/server-logic/dashboard/dashboard.serverlogic.yml`
- Test: `test/server-logic/dashboard.test.ts`

**Interfaces:**
- Consumes: `ORDER_STATUS_FILTER` (Task 1), `sessionScope`, `bcGet`, `odataLiteral`, `odataQuery`, `respond`.
- Produces: `GET /_api/serverlogics/dashboard` → `{ counts: { open, pendingPrepayment, readyForDispatch, completelyShipped, invoiced: null }, account: { balance: null, balanceDue: null, overdue: null, creditLimit: number | null, availableCredit: null } }`.

- [ ] **Step 1: Write the failing tests** — create `test/server-logic/dashboard.test.ts`:

```ts
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

function fakeServer({ query = {} as Record<string, string>, card = [{ Customer_No: 'C00000002', CreditLimit: 750000 }] as unknown[], bcDown = false } = {}) {
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
          if (plain.includes('/mcrmCustomers')) return ok({ value: card })
          const status = Object.keys(RULES).find((s) => plain.includes(RULES[s]))!
          return ok({ value: [{ salesOrderNo: 'SOR1' }], '@odata.count': COUNTS[status] })
        },
      },
    },
  }
  return { server, http }
}

const orderCalls = (http: string[]) => http.filter((u) => u.includes('/mcrmSalesOrders?'))

test('counts each status with exactly the Orders filter rule, and reads the credit limit', async () => {
  const { server, http } = fakeServer()
  expect(JSON.parse(await load(server).get())).toEqual({
    counts: { open: 7, pendingPrepayment: 1, readyForDispatch: 2, completelyShipped: 0, invoiced: null },
    account: { balance: null, balanceDue: null, overdue: null, creditLimit: 750000, availableCredit: null },
  })
  const calls = orderCalls(http)
  expect(calls).toHaveLength(4)
  for (const rule of Object.values(RULES)) {
    const call = calls.find((c) => c.includes(rule))!
    expect(call).toContain(`$filter=sellToCustomerNo eq 'C00000002' and documentType eq 'Order' and ${rule}&`)
    expect(call).toContain('$top=1')
    expect(call).toContain('$count=true')
  }
  expect(http.some((u) => u.includes("/mcrmCustomers?$filter=Customer_No eq 'C00000002'"))).toBe(true)
})

test("no customer-card row, or another customer's row, gives no credit limit", async () => {
  for (const card of [[], [{ Customer_No: 'C99', CreditLimit: 1 }]]) {
    const { server } = fakeServer({ card })
    expect(JSON.parse(await load(server).get()).account.creditLimit).toBeNull()
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/server-logic/dashboard.test.ts`
Expected: FAIL — `ENOENT … dashboard.js`.

- [ ] **Step 3: Write the endpoint**

Create `.powerpages-site/server-logic/dashboard/dashboard.serverlogic.yml`:

```yaml
adx_serverlogic_adx_webrole:
  - 56b29291-b981-4ef0-865b-41c1e9523a97
  - 11bb7218-55fb-4cae-b8a1-5af2f41237c5
  - c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3
  - 0c42c9f3-bc20-40a2-8c6a-a731a263ed83
description: 'Signed-in customer''s Dashboard figures: Sales Orders counts per status and the account overview (S2-11)'
display_name: 'Dashboard (BC counts and account overview)'
id: d1900c3f-40f9-4bdb-a195-aad2617aed2b
name: dashboard
```

Create `.powerpages-site/server-logic/dashboard/dashboard.js` (the region lines are filled in by the stamper):

```js
// Server Logic: dashboard (S2-11)
// Purpose: the signed-in customer's Dashboard figures — Sales Orders counts per status (live from BC) and the
// account overview. Customer and company come only from the session's Account.
// API URL: https://<site>/_api/serverlogics/dashboard

async function get() {
    // #region bc-helpers (generated from server-logic-src/bc-helpers.js — do not edit)
    // #endregion bc-helpers

    // DTO keys for the portal statuses counted from mcrmSalesOrders; Invoiced waits for BC's archive change (S2-03).
    var COUNT_KEYS = {
        "Open": "open",
        "Pending Prepayment": "pendingPrepayment",
        "Ready for Dispatch": "readyForDispatch",
        "Completely Shipped": "completelyShipped"
    };

    // One row and @odata.count: no orders are downloaded to count them.
    async function countOrders(scope, status) {
        var result = await bcGet(
            scope,
            "mcrmSalesOrders",
            odataQuery({
                $filter: "sellToCustomerNo eq " + odataLiteral(scope.customerNo) + " and documentType eq 'Order' and " + ORDER_STATUS_FILTER[status],
                $select: "salesOrderNo",
                $top: "1",
                $count: "true"
            })
        );
        var count = Number(result && result["@odata.count"]);
        return isNaN(count) ? 0 : count;
    }

    async function creditLimit(scope) {
        var result = await bcGet(
            scope,
            "mcrmCustomers",
            odataQuery({ $filter: "Customer_No eq " + odataLiteral(scope.customerNo), $select: "Customer_No,CreditLimit", $top: "1" })
        );
        var card = ((result && result.value) || []).find((row) => row.Customer_No === scope.customerNo);
        return card ? Number(card.CreditLimit) || 0 : null;
    }

    Server.Logger.Log("dashboard GET called");
    return respond(async () => {
        var scope = await sessionScope();
        var statuses = Object.keys(COUNT_KEYS);
        var results = await Promise.all(statuses.map((status) => countOrders(scope, status)).concat([creditLimit(scope)]));
        var counts = { invoiced: null };
        statuses.forEach((status, i) => {
            counts[COUNT_KEYS[status]] = results[i];
        });
        return {
            counts: counts,
            // Balance, balance due and overdue will come from BC's customer card, available credit from S2-09: null until then.
            account: { balance: null, balanceDue: null, overdue: null, creditLimit: results[statuses.length], availableCredit: null }
        };
    });
}
```

Run: `node scripts/stamp-server-logic-helpers.mjs` → Expected: `stamped: …\dashboard\dashboard.js`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run test/server-logic`
Expected: all pass (incl. the banned-pattern scan and the Task 1 "no own status clauses" test).

- [ ] **Step 5: Commit**

```bash
git add .powerpages-site/server-logic/dashboard test/server-logic/dashboard.test.ts
git commit -m "S2-11: dashboard Server Logic — Sales Orders counts per status from BC \$count with the shared Orders rules, credit limit from the customer card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dashboard screen

**Files:**
- Modify: `src/api/types.ts` (append `DashboardDto`)
- Create: `src/mocks/dashboard.ts`; Modify: `src/mocks/index.ts`
- Create: `src/modules/dashboard/useDashboard.ts`, `src/modules/dashboard/StatTile.tsx`
- Modify: `src/modules/dashboard/DashboardPage.tsx`
- Test: `src/modules/dashboard/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 response; `canSee(roles, 'orders')` from `@/auth/access`; `useMe` from `@/auth/useMe`; `peso` from `@/lib/format`; `MOCK_ORDERS` from `@/mocks/orders`.
- Produces: `DashboardDto`; `dashboardMock(): DashboardDto`; `useDashboard()`; `StatTile({ label, value, caption?, tone?, to? })`.

- [ ] **Step 1: Write the failing tests**

In `src/modules/dashboard/DashboardPage.test.tsx`:

1. Replace the import lines and add helpers so each test answers one endpoint by name (the page now calls `me`, `announcement` and `dashboard`, so call-order mocks no longer work). New header:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { DashboardDto, MeDto } from '@/api/types'
import { MOCK_SESSION_KEY } from '@/auth/session'
import { dashboardMock } from '@/mocks/dashboard'
import { renderApp } from '@/test/render'
import { DashboardPage } from './DashboardPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
/** Answer one Server Logic by name; every other endpoint keeps its dev-server mock. */
function answer(name: string, value: unknown) {
  vi.mocked(serverLogic).mockImplementation(async (n, options) => {
    if (n !== name) return actualServerLogic(n, options)
    if (value instanceof Error) throw value
    return value as never
  })
}
const region = (name: string) => screen.findByRole('region', { name })
```

2. In the existing test `no banner when %s, and the Dashboard still loads`, replace the two arrange functions with:

```tsx
  ['there is no active announcement', () => answer('announcement', null)],
  ['the read fails', () => answer('announcement', new ApiError(500, 'x'))],
```

3. Append:

```tsx
test('Account overview shows the BC figures in the wireframe tiles; overdue is red when something is overdue', async () => {
  renderApp(<DashboardPage />)
  const overview = await region('Account overview')
  expect(await within(overview).findByText('₱468,250.00')).toBeInTheDocument()
  for (const [label, caption] of [
    ['Outstanding Balance', 'Total outstanding on your account'],
    ['Balance Due Today', 'Due now per your payment terms'],
    ['Credit limit', 'Set on your customer record'],
    ['Available credit', 'Kept in sync with your live credit standing'],
  ]) {
    expect(within(overview).getByText(label)).toBeInTheDocument()
    expect(within(overview).getByText(caption)).toBeInTheDocument()
  }
  expect(within(overview).getByText('₱42,500.00')).toHaveClass('text-destructive')
  expect(within(overview).getByText('Past its due date — please settle to avoid delivery holds')).toBeInTheDocument()
})

test('nothing overdue is green; figures BC has not provided yet show a dash and are never green', async () => {
  const base = dashboardMock()
  answer('dashboard', { ...base, account: { ...base.account, overdue: 0 } } satisfies DashboardDto)
  const first = renderApp(<DashboardPage />)
  expect(await within(await region('Account overview')).findByText('Nothing past due — account in good standing')).toBeInTheDocument()
  first.unmount()
  answer('dashboard', { ...base, account: { balance: null, balanceDue: null, overdue: null, creditLimit: 750000, availableCredit: null } } satisfies DashboardDto)
  renderApp(<DashboardPage />)
  const overview = await region('Account overview')
  expect(await within(overview).findAllByText('—')).toHaveLength(4)
  expect(within(overview).getByText('Past its due date')).toBeInTheDocument()
  expect(within(overview).queryByText('Nothing past due — account in good standing')).not.toBeInTheDocument()
})

test('Sales Orders tiles link to the filtered Orders list for roles that can open Orders; Invoiced shows a dash', async () => {
  renderApp(<DashboardPage />)
  const orders = await region('Sales Orders')
  const open = await within(orders).findByRole('link', { name: /Open/ })
  expect(open).toHaveAttribute('href', '/orders?status=Open')
  expect(open).toHaveTextContent('View these orders →')
  expect(within(orders).getByRole('link', { name: /Pending prepayment/ })).toHaveAttribute('href', '/orders?status=Pending%20Prepayment')
  expect(within(orders).getByRole('link', { name: /Ready for dispatch/ })).toHaveAttribute('href', '/orders?status=Ready%20for%20Dispatch')
  expect(within(orders).getByRole('link', { name: /Completely shipped/ })).toHaveTextContent('4')
  expect(within(orders).queryByRole('link', { name: /Invoiced/ })).not.toBeInTheDocument()
  expect(within(orders).getByText('Invoiced').parentElement).toHaveTextContent('—')
})

test('a zero count is a real figure', async () => {
  const base = dashboardMock()
  answer('dashboard', { ...base, counts: { ...base.counts, open: 0 } } satisfies DashboardDto)
  renderApp(<DashboardPage />)
  expect(await within(await region('Sales Orders')).findByRole('link', { name: /Open\s*0/ })).toBeInTheDocument()
})

test('Finance & Documents sees the counts without links', async () => {
  sessionStorage.setItem(MOCK_SESSION_KEY, 'finance@test.ph')
  renderApp(<DashboardPage />)
  await screen.findByText(/^Good (morning|afternoon|evening)/) // me has loaded
  const orders = await region('Sales Orders')
  await within(orders).findByText('Open')
  expect(within(orders).queryAllByRole('link')).toHaveLength(0)
  expect(within(orders).queryByText('View these orders →')).not.toBeInTheDocument()
})

test('a failed load shows the error with Try again; the greeting and announcement stay', async () => {
  const user = userEvent.setup()
  answer('dashboard', new ApiError(500, 'x'))
  renderApp(<DashboardPage />)
  expect(await screen.findByText("We couldn't load this information. Please try again.")).toBeInTheDocument()
  expect(await screen.findByText('Holiday order cutoff schedule')).toBeInTheDocument()
  vi.mocked(serverLogic).mockImplementation(actualServerLogic)
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await region('Sales Orders')).toBeInTheDocument()
})

// Until BC has balances (S2-07) and available credit (S2-09), the deployed site shows only the Sales Orders tiles.
test('the deployed build hides the Account overview', async () => {
  vi.stubEnv('DEV', false)
  const me: MeDto = { contact: { name: 'J.D. Santos', email: 'full@test.ph' }, account: null, roles: ['Full Access'] }
  vi.mocked(serverLogic).mockImplementation(async (name) => (name === 'me' ? me : name === 'dashboard' ? dashboardMock() : null) as never)
  renderApp(<DashboardPage />)
  expect(await region('Sales Orders')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Account overview' })).not.toBeInTheDocument()
})
```

4. In the existing first test (`shows the active announcement above the Dashboard`) nothing changes; the page no longer has the "coming soon" caption, so if any assertion mentions it, delete that line.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/modules/dashboard`
Expected: FAIL — cannot resolve `@/mocks/dashboard`.

- [ ] **Step 3: Add the DTO, mock and hook**

Append to `src/api/types.ts`:

```ts
/** GET /_api/serverlogics/dashboard. null = BC doesn't provide it yet (Invoiced: archive change; balances: S2-07; available credit: S2-09). */
export interface DashboardDto {
  counts: { open: number; pendingPrepayment: number; readyForDispatch: number; completelyShipped: number; invoiced: number | null }
  account: { balance: number | null; balanceDue: number | null; overdue: number | null; creditLimit: number | null; availableCredit: number | null }
}
```

Create `src/mocks/dashboard.ts`:

```ts
import type { DashboardDto, OrderStatus } from '@/api/types'
import { MOCK_ORDERS } from './orders'

const count = (status: OrderStatus) => MOCK_ORDERS.filter((order) => order.status === status).length

/** Wireframe LEDGER and CREDIT figures; counts from the local sample orders so the tiles match the local Orders list. */
export function dashboardMock(): DashboardDto {
  return {
    counts: {
      open: count('Open'),
      pendingPrepayment: count('Pending Prepayment'),
      readyForDispatch: count('Ready for Dispatch'),
      completelyShipped: count('Completely Shipped'),
      invoiced: null,
    },
    account: { balance: 468250, balanceDue: 210000, overdue: 42500, creditLimit: 750000, availableCredit: 414250 },
  }
}
```

In `src/mocks/index.ts` add `import { dashboardMock } from './dashboard'` next to the other mock imports and `dashboard: dashboardMock,` in the `mocks` object next to `orders: ordersMock,`.

Create `src/modules/dashboard/useDashboard.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { DashboardDto } from '@/api/types'

/** Dashboard figures, read live from BC; staleTime 0 refetches them on every Dashboard visit (as the announcement). */
export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => serverLogic<DashboardDto>('dashboard'), staleTime: 0 })
}
```

- [ ] **Step 4: Add the tile and the page sections**

Create `src/modules/dashboard/StatTile.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export type TileTone = 'neutral' | 'alert' | 'clear' | 'warn' | 'progress'

const EDGE: Record<TileTone, string> = {
  neutral: 'border-l-border',
  alert: 'border-l-destructive',
  clear: 'border-l-success',
  warn: 'border-l-warning',
  progress: 'border-l-primary',
}

/** Wireframe .stat-tile: label, large value, caption; a link (.stat-tile-clickable) when `to` is set. */
export function StatTile({ label, value, caption, tone = 'neutral', to }: { label: string; value: ReactNode; caption?: string; tone?: TileTone; to?: string }) {
  const body = (
    <>
      <div className="mb-2 text-[13px] font-semibold text-muted-foreground">{label}</div>
      <div className={cn('text-[26px] leading-tight font-bold', tone === 'alert' && 'text-destructive', tone === 'warn' && 'text-warning')}>{value}</div>
      {caption && (
        <div className={cn('mt-1.5 text-xs', to ? 'font-semibold text-primary' : tone === 'clear' ? 'text-success' : 'text-faint')}>{caption}</div>
      )}
    </>
  )
  const box = cn('block rounded-[10px] border border-l-[3px] bg-card px-5 py-[18px] shadow-card', EDGE[tone])
  return to ? (
    <Link to={to} className={cn(box, 'transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2')}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  )
}
```

Replace `src/modules/dashboard/DashboardPage.tsx` with:

```tsx
import type { ReactNode } from 'react'
import type { DashboardDto } from '@/api/types'
import { canSee } from '@/auth/access'
import { useMe } from '@/auth/useMe'
import { peso } from '@/lib/format'
import { usePageTitle } from '@/lib/usePageTitle'
import { PageHeader } from '@/ui/PageHeader'
import { QueryError } from '@/ui/QueryError'
import { Skeleton } from '@/ui/skeleton'
import { AnnouncementBanner } from './AnnouncementBanner'
import { Greeting } from './Greeting'
import { StatTile, type TileTone } from './StatTile'
import { useDashboard } from './useDashboard'

const GRID = 'grid grid-cols-2 gap-3.5 md:grid-cols-5'
const NO_ROLES: string[] = []
const ORDER_TILES: { key: keyof DashboardDto['counts']; label: string; status: string; tone: TileTone }[] = [
  { key: 'open', label: 'Open', status: 'Open', tone: 'neutral' },
  { key: 'pendingPrepayment', label: 'Pending prepayment', status: 'Pending Prepayment', tone: 'warn' },
  { key: 'readyForDispatch', label: 'Ready for dispatch', status: 'Ready for Dispatch', tone: 'progress' },
  { key: 'completelyShipped', label: 'Completely shipped', status: 'Completely Shipped', tone: 'clear' },
  { key: 'invoiced', label: 'Invoiced', status: 'Invoiced', tone: 'clear' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `dashboard-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section aria-labelledby={id} className="mb-[30px]">
      <h2 id={id} className="mb-3.5 text-[19px] font-bold">
        {title}
      </h2>
      <div className={GRID}>{children}</div>
    </section>
  )
}

export function DashboardPage() {
  usePageTitle('Dashboard')
  const dashboard = useDashboard()
  const roles = useMe().data?.roles ?? NO_ROLES
  const canOpenOrders = canSee(roles, 'orders')
  const data = dashboard.data
  const money = (value: number | null | undefined) => (data ? (value == null ? '—' : peso(value)) : <Skeleton className="h-7 w-32" />)
  const overdue = data?.account.overdue ?? null
  const overdueTone: TileTone = overdue == null ? 'neutral' : overdue > 0 ? 'alert' : 'clear'
  const overdueCaption =
    overdueTone === 'alert'
      ? 'Past its due date — please settle to avoid delivery holds'
      : overdueTone === 'clear'
        ? 'Nothing past due — account in good standing'
        : 'Past its due date'

  return (
    <>
      <PageHeader title="Dashboard" />
      <Greeting />
      <AnnouncementBanner />
      {dashboard.isError ? (
        <QueryError onRetry={() => void dashboard.refetch()} />
      ) : (
        <>
          {/* ponytail: Account overview only in the local build until BC has balances (S2-07) and available credit (S2-09); delete this condition then. */}
          {import.meta.env.DEV && (
            <Section title="Account overview">
              <StatTile label="Outstanding Balance" value={money(data?.account.balance)} caption="Total outstanding on your account" />
              <StatTile label="Balance Due Today" value={money(data?.account.balanceDue)} caption="Due now per your payment terms" />
              <StatTile label="Overdue amount" value={money(data ? overdue : undefined)} caption={overdueCaption} tone={overdueTone} />
              <StatTile label="Credit limit" value={money(data?.account.creditLimit)} caption="Set on your customer record" />
              <StatTile label="Available credit" value={money(data?.account.availableCredit)} caption="Kept in sync with your live credit standing" />
            </Section>
          )}
          <Section title="Sales Orders">
            {ORDER_TILES.map((tile) => {
              const count = data?.counts[tile.key]
              const link = canOpenOrders && count != null
              return (
                <StatTile
                  key={tile.key}
                  label={tile.label}
                  tone={tile.tone}
                  value={data ? (count == null ? '—' : count.toLocaleString('en-PH')) : <Skeleton className="h-7 w-12" />}
                  caption={link ? 'View these orders →' : undefined}
                  to={link ? `/orders?status=${encodeURIComponent(tile.status)}` : undefined}
                />
              )
            })}
          </Section>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/modules/dashboard src/layout`
Expected: all pass.

- [ ] **Step 6: Full checks**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all tests pass, lint exits 0, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/api/types.ts src/mocks/dashboard.ts src/mocks/index.ts src/modules/dashboard/useDashboard.ts src/modules/dashboard/StatTile.tsx src/modules/dashboard/DashboardPage.tsx src/modules/dashboard/DashboardPage.test.tsx
git commit -m "S2-12: Dashboard — Sales Orders tiles live from BC linking to the filtered Orders list for roles with Orders access, Account overview in the wireframe tiles (local build only until BC has balances and credit)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Docs, BC request, deploy to Dev

**Files:**
- Modify: `docs/Concreat_Hub_Implementation_Plan.md` (rows S2-07, S2-09, S2-10, S2-11, S2-12)
- Modify: `docs/wording-checklist.md` (one row; stage only that row)

- [ ] **Step 1: Plan rows** — in `docs/Concreat_Hub_Implementation_Plan.md`:
  - **S2-10**: status `⏸ Not needed`; notes `2026-10-15: counts come from $count on mcrmSalesOrders with the shared Orders status rules (dashboard Server Logic).`
  - **S2-11**: status `🟡 Deployed to Dev`; notes `2026-10-15: dashboard Server Logic — 4 status counts via $count + credit limit from mcrmCustomers, in parallel; balance/balance due/overdue/available credit null until BC.`
  - **S2-12**: status `🟡 Deployed to Dev`; replace "no greeting (removed in mockup v2, 2026-09-29)" in the task text with "greeting (restored 2026-10-13)"; notes `2026-10-15: Sales Orders tiles live (links for roles with Orders access; Invoiced "—" until the archive change); Account overview built on sample data, local build only until S2-07/S2-09.`
  - **S2-07** notes, append: `Dashboard also needs Balance (LCY), Balance Due (LCY) and an overdue amount on mcrmCustomers (customer card FlowFields).`
  - **S2-09** notes: `Dashboard tile Available credit and New Order (S3-09) read it from the dashboard endpoint once BC exposes it.`

- [ ] **Step 2: Wording row** — add after the Customer Ledger row in `docs/wording-checklist.md`:

```
| Dashboard: "Account overview" tiles Outstanding Balance · Balance Due Today · Overdue amount · Credit limit · Available credit with the mockup captions (overdue: "Past its due date — please settle to avoid delivery holds" / "Nothing past due — account in good standing"); "Sales Orders" tiles Open · Pending prepayment · Ready for dispatch · Completely shipped · Invoiced, "View these orders →" | Mockup v2 `#panel-dashboard` | `src/modules/dashboard/` | ☐ |
```

Stage only that row: build the staged blob from `HEAD`'s version plus the row (keep `HEAD`'s line endings), `git update-index --cacheinfo 100644,<blob>,docs/wording-checklist.md`; verify `git diff --cached --stat docs/wording-checklist.md` shows `1 insertion(+)`.

- [ ] **Step 3: Commit**

```bash
git add docs/Concreat_Hub_Implementation_Plan.md
git commit -m "S2-10/S2-11/S2-12: plan rows — counts via \$count (no counts API), Dashboard deployed; balance fields asked on the customer card; wording row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Deploy to Dev**

If `src/modules/orders/OrdersPage.tsx` still has the user's `console.log(data)` uncommitted, it would be deployed too — tell the user before deploying and ask. Otherwise run: `npm run deploy` → Expected: `Target confirmed: https://org380257ac.crm5.dynamics.com/`, a successful build, `Upload complete`.

- [ ] **Step 5: Hand the user the BC message** (in chat): balance fields on `mcrmCustomers` — `balanceLCY` (Balance (LCY)), `balanceDueLCY` (Balance Due (LCY), as of today), `overdueAmountLCY` (overdue as of today) — and S2-09 `availableCredit` (credit limit − exposure, live).
