# S3-04 / S3-11 Credit orders and credit approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers can submit Credit orders; ones within BC credit with no past due go straight to BC, the rest wait in Dataverse for the CHP credit team's Outlook approval and are created in BC only when approved.

**Architecture:** `orders` POST (Server Logic) re-quotes, reads `mcrmCustCreditOverviews`, then either POSTs the BC Sales Order or creates a `chp_creditapproval` row holding the exact BC request body. A Dataverse-triggered cloud flow runs *Start and wait for an approval* against the credit team group and, on Approve, replays that body to BC. `orders?view=pending` lists the account's held and declined rows for the new Pending Approval tab.

**Tech Stack:** Power Pages Server Logic (JS, no modules), Dataverse (Python scripts in `scripts/dataverse`), Power Automate (definition JSON deployed by `portal_flows.py`), React 19 + TanStack Query + React Hook Form, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-10-28-s3-04-credit-orders-design.md`

## Global Constraints

- Payment method codes: cash `CASH` (unconfirmed, unchanged), credit **`CREDIT`** (confirmed 2026-10-28).
- Rule: total `<= availableCredit` **and** `overdueAmount === 0` → auto-released; else held. Both figures from `mcrmCustCreditOverviews` only; never recomputed.
- Reasons, exact strings, past due first, joined with `' · '`: `Account has a past due balance`, `Order exceeds available credit`.
- Status option values: `775000000` Awaiting credit approval · `775000001` Approved · `775000002` Declined. Labels shown: `Awaiting credit approval`, `Declined`.
- Every BC order (cash, auto-released credit, approved credit) is created **Open**; nothing about approvals is written to BC.
- **No customer email** in any branch. No portal-side approval timeout. No cancel/edit of a held order.
- Copy, exact: auto-released note `"<SO> was auto-approved — within available credit, no past due balance."`; held note `"Your order was sent to our credit team for review."`; past-due warning `"⚠ Your account has a past due balance. You may still submit this order for review by our credit team."`; empty tab `"No orders are waiting for approval."`; tab title `"Pending Approval — Concreat Connect"` (via `usePageTitle('Pending Approval')`).
- Roles everywhere: Full Access `56b29291-b981-4ef0-865b-41c1e9523a97`, Orders & Delivery `11bb7218-55fb-4cae-b8a1-5af2f41237c5`.
- Server Logic: shared helpers are stamped from `server-logic-src/bc-helpers.js` (`node scripts/stamp-server-logic-helpers.mjs`), never hand-edited; banned patterns (`eval`, `setTimeout`, `delete`, `prototype`, `Reflect.`) stay out. Customer/company/contact/account always from the session.
- Dev only. Deploy only with `npm run deploy` / `pac pages upload-code-site` after `pac auth who` shows Dev.

## Review Focus

1. **BC credit overview fails or has no row** → credit submit fails with the safe error; no BC order, no Dataverse row. (Task 2 test `credit figures missing`)
2. **Total exactly equal to available credit** → auto-released, not held. (Task 2 test `equal to available`)
3. **Credit limit 0 / negative available credit** → held with "Order exceeds available credit". (Task 2 test `negative available`)
4. **Cash order from a past-due or over-limit customer** → still created at once, credit overview never read. (Task 2 test `cash ignores credit`)
5. **A rerun of the approval flow** (resubmit from run history) → no second BC order because `chp_salesorderno` is already set. (Task 6 Dev check step)

---

### Task 1: Dataverse table, environment variable and table permission

**Files:**
- Create: `scripts/dataverse/creditapproval_schema.py`
- Modify: `scripts/dataverse/env_vars.py` (add `chp_CreditApprovalGroup`, Dev value `chp-credit-team@automations365.com`)
- Create: `.powerpages-site/table-permissions/Credit-approval-account-(read-create).tablepermission.yml`
- Test: `test/server-logic/permissions.test.ts`

**Interfaces:**
- Produces: table `chp_creditapproval` (entity set `chp_creditapprovals`), navigation properties `chp_Contact`, `chp_Account`; columns `chp_name`, `chp_status`, `chp_reason`, `chp_estimatedtotal`, `chp_availablecredit`, `chp_overdueamount`, `chp_poref`, `chp_site`, `chp_payload`, `chp_salesorderno`, `chp_approvername`, `chp_approveremail`, `chp_comment`, `chp_decidedon`. Env var `chp_CreditApprovalGroup`.

- [ ] **Step 1: Write the failing permission test** (append to `permissions.test.ts`, same `named()` helper)

```ts
test('credit approvals: the account sees its held orders; only the flow changes them', () => {
  const p = named('Credit approval - account (read, create)')!
  expect(p.field('entitylogicalname')).toBe('chp_creditapproval')
  expect(p.field('scope')).toBe('756150002') // Account
  expect(p.field('accountrelationship')).toBe('chp_account_chp_creditapproval')
  for (const privilege of ['read', 'create', 'append', 'appendto']) expect(p.field(privilege), privilege).toBe('true')
  for (const privilege of ['write', 'delete']) expect(p.field(privilege), privilege).toBe('false')
  expect(p.text).toContain('- 56b29291-b981-4ef0-865b-41c1e9523a97')
  expect(p.text).toContain('- 11bb7218-55fb-4cae-b8a1-5af2f41237c5')
  expect(p.text).not.toContain('b2780841-e908-44f8-b7d8-dfd367bfeeb2')
})
```

- [ ] **Step 2: Run it to see it fail** — `npx vitest run test/server-logic/permissions.test.ts` → FAIL (permission missing).
- [ ] **Step 3: Write the table permission YAML** in the shape of `Order-draft-own-(CRUD).tablepermission.yml`, with `scope: 756150002`, `accountrelationship: chp_account_chp_creditapproval`, a new GUID `id`, `entityname: Credit approval - account (read, create)`. Confirm the Account-scope key name against Microsoft Learn (Power Pages table permissions, Account scope) before relying on it; if the key differs, change test and YAML together.
- [ ] **Step 4: Run the test** → PASS.
- [ ] **Step 5: Write `creditapproval_schema.py`** following `orderdraft_schema.py`: `ensure_table('chp_CreditApproval', 'Credit Approval', 'Credit Approvals', 'Credit orders held for the credit team (S3-04). Sent to BC only when approved.', text('chp_Name', 'Name', 100, is_required=True, primary=True))`; `ensure_lookup(... 'chp_Account' ... 'chp_account_chp_creditapproval', True, 'Cascade')`, `ensure_lookup(... 'chp_Contact' ... 'chp_contact_chp_creditapproval', True, 'Restrict')`; `choice('chp_Status', 'Status', [(775000000,'Awaiting credit approval'),(775000001,'Approved'),(775000002,'Declined')], default=775000000, is_required=True)`; text: `chp_Reason` 200, `chp_PORef` 35, `chp_Site` 20, `chp_SalesOrderNo` 20, `chp_ApproverName` 200, `chp_ApproverEmail` 200; Memo `chp_Payload` 100000, `chp_Comment` 4000; Decimal (precision 2) `chp_EstimatedTotal`, `chp_AvailableCredit`, `chp_OverdueAmount` (allow negatives); DateTime `chp_DecidedOn`; then `PublishXml`.
- [ ] **Step 6: Run on Dev** — `pac auth who` (expect *CHP Customer Portal*), then `python scripts/dataverse/creditapproval_schema.py` and `python scripts/dataverse/env_vars.py` (as the README/usage line of each says). Expected: `+`/`=` lines and `Done.`; the env var shows in `ConcreatHub`.
- [ ] **Step 7: Commit** — `git add scripts/dataverse/creditapproval_schema.py scripts/dataverse/env_vars.py ".powerpages-site/table-permissions/Credit-approval-account-(read-create).tablepermission.yml" test/server-logic/permissions.test.ts` → `S3-04: chp_creditapproval table, credit approval group env var, account-scope permission`.

---

### Task 2: `orders` POST — Credit orders (auto-release or hold)

**Files:**
- Modify: `.powerpages-site/server-logic/orders/orders.js` (`post()`: `readRequest`, `salesOrder`, new `creditOverview`, `heldReason`, `holdOrder`; the header comment at line ~610)
- Modify: `.powerpages-site/server-logic/orders/orders.serverlogic.yml` (description)
- Test: `test/server-logic/orders-submit.test.ts`

**Interfaces:**
- Consumes: Task 1 table/columns.
- Produces: POST answers `{ so: string }` (cash) · `{ so: string, autoApproved: true }` (credit, released) · `{ pending: true }` (credit, held) · `{ notPriced: true }` · `{ blocked: true }`. Payload JSON stored in `chp_payload`: `{ version: 1, companyId: string, salesOrder: <exact mcrmSalesOrders body>, lines: [{ code, qty, uom, unitPrice, amount }] }`.

- [ ] **Step 1: Extend the test harness** in `orders-submit.test.ts`: `fakeServer(body, { ..., credit = { overdueAmount: 0, availableCredit: 50000 } as unknown, creditFails = false })`; `GetAsync` answers URLs containing `/mcrmCustCreditOverviews` with `ok({ value: credit ? [{ customerNo: 'C00000002', ...credit }] : [] })` (or a 500 envelope when `creditFails`); `Dataverse.CreateRecord: (set, json) => { created.push({ set, row: JSON.parse(json) }); return '{}' }`; return `created` and a `creditReads()` counter.

- [ ] **Step 2: Write the failing tests** (`CREDIT = { ...PICKUP, paymentMethod: 'credit' }`; one quoted line totals `11250`)

```ts
test('credit within available and no past due: created at once with CREDIT, nothing held', async () => {
  const { server, orders, created } = fakeServer(CREDIT, { credit: { overdueAmount: 0, availableCredit: 50000 } })
  expect(JSON.parse(await load(server).post())).toEqual({ so: 'SOR000000024', autoApproved: true })
  expect(orders()[0].body.paymentMethodCode).toBe('CREDIT')
  expect(created).toEqual([])
})
test('credit equal to available: released (≤)', async () => { /* availableCredit: 11250 → { so, autoApproved: true } */ })
test.each([
  ['over credit', { overdueAmount: 0, availableCredit: 11249.99 }, 'Order exceeds available credit'],
  ['negative available', { overdueAmount: 0, availableCredit: -500 }, 'Order exceeds available credit'],
  ['past due', { overdueAmount: 1, availableCredit: 50000 }, 'Account has a past due balance'],
  ['both', { overdueAmount: 24750, availableCredit: 2000 }, 'Account has a past due balance · Order exceeds available credit'],
])('credit %s: held for the credit team, nothing sent to BC', async (_name, credit, reason) => {
  const { server, orders, created } = fakeServer({ ...DELIVERY, paymentMethod: 'credit' }, { credit })
  expect(JSON.parse(await load(server).post())).toEqual({ pending: true })
  expect(orders()).toEqual([])
  expect(created).toHaveLength(1)
  const { set, row } = created[0]
  expect(set).toBe('chp_creditapprovals')
  expect(row).toMatchObject({
    chp_name: 'C00000002 · PO-8915', chp_status: 775000000, chp_reason: reason,
    chp_estimatedtotal: 11250, chp_availablecredit: credit.availableCredit, chp_overdueamount: credit.overdueAmount,
    chp_poref: 'PO-8915', chp_site: '65072350',
    'chp_Contact@odata.bind': '/contacts(c-1)', 'chp_Account@odata.bind': '/accounts(acc-2)',
  })
  const payload = JSON.parse(row.chp_payload)
  expect(payload).toMatchObject({ version: 1, companyId: 'co-1', lines: [{ code: '100016', qty: 50, uom: 'BAG/40', unitPrice: 210, amount: 10500 }] })
  expect(payload.salesOrder).toMatchObject({ sellToCustomerNo: 'C00000002', shipmentMethodCode: 'DELIVERY', paymentMethodCode: 'CREDIT', shiptoCode: '65072350' })
})
test('a held pick up order stores the plant as its site and the date as its name without a PO', async () => {
  /* { ...CREDIT, poRef: '' }, past due → chp_site 'SOLID', chp_name 'C00000002 · 2026-10-26', chp_poref '' */
})
test.each([['credit figures missing', { credit: null }], ['credit read fails', { creditFails: true }]])(
  "%s: safe error, no order, nothing held", async (_n, opts) => {
    const { server, orders, created } = fakeServer(CREDIT, opts)
    await expect(load(server).post()).rejects.toThrow("We couldn't load this information. Please try again.")
    expect(orders()).toEqual([]); expect(created).toEqual([])
  })
test('cash ignores credit: a past-due customer still gets the order and the overview is never read', async () => {
  const { server, orders, creditReads } = fakeServer(PICKUP, { credit: { overdueAmount: 99, availableCredit: -1 } })
  expect(JSON.parse(await load(server).post())).toEqual({ so: 'SOR000000024' })
  expect(orders()[0].body.paymentMethodCode).toBe('CASH'); expect(creditReads()).toBe(0)
})
```

Remove `['credit payment (Phase 2)', { paymentMethod: 'credit' }]` from the refused list; add `['an unknown payment method', { paymentMethod: 'cheque' }]`. Change the file's header comment to say credit is handled.

- [ ] **Step 3: Run** — `npx vitest run test/server-logic/orders-submit.test.ts` → the new tests FAIL.
- [ ] **Step 4: Implement in `post()`** (endpoint code only, below `#endregion bc-helpers`):
  - `var CREDIT = "CREDIT";` next to `CASH` (comment: confirmed with BC 2026-10-28).
  - `readRequest()` accepts `body.paymentMethod` `"cash"` or `"credit"` and returns it as `request.paymentMethod`.
  - `salesOrder(scope, choices, details, paymentMethodCode)`.
  - `async function creditOverview(scope)` → `{ overdue: number, available: number }`: same `bcGet` query as `dashboard.js` `accountOverview` (`$filter customerNo eq <literal>`, `$select=customerNo,overdueAmount,availableCredit`, `$top=1`), row matched on `customerNo`; **throws** when the call fails or there's no row (never defaults).
  - `function heldReason(total, credit)` → `""` when `total <= credit.available && credit.overdue === 0`, else the reasons per Global Constraints.
  - Flow after the `notPriced` check: cash → as today. Credit → total = `cents(Σ quote.total)`; read `creditOverview`; no reason → `bcPost` with `CREDIT`, answer `{ so, autoApproved: true }`; reason → `holdOrder(...)` with `Server.Connector.Dataverse.CreateRecord("chp_creditapprovals", JSON.stringify({...}))` as the test pins (`chp_site` = `choices.delivery ? choices.site : choices.source`; `chp_name` = `customerNo + " · " + (poRef || orderDate)`), pass the result through `parseResult(..., "dataverse")`, answer `{ pending: true }`.
  - Quote and credit read may run in parallel (`Promise.all`) for credit orders.
- [ ] **Step 5: Run the file** → PASS; then `npx vitest run test/server-logic` → PASS (the stamped-helpers drift test included).
- [ ] **Step 6: Update `orders.serverlogic.yml` description** to `'... POST submits a New Order (S3-10): cash, or credit released when within BC credit and held for the credit team otherwise (S3-04)'`.
- [ ] **Step 7: Commit** — `S3-04: orders POST submits credit orders (auto-released within credit, held for the credit team otherwise)`.

---

### Task 3: `orders` GET `?view=pending`

**Files:**
- Modify: `.powerpages-site/server-logic/orders/orders.js` (`get()`: branch before `type=blanket`)
- Test: `test/server-logic/orders.test.ts`

**Interfaces:**
- Produces: `GET orders?view=pending` → `PendingOrderDto[]` (shape in Task 4), newest first, rows with status Awaiting or Declined of the **session account** only.

- [ ] **Step 1: Write the failing tests** in `orders.test.ts` (reuse its fake server; add `Dataverse.RetrieveMultipleRecords: (set, query) => { reads.push({ set, query }); return JSON.stringify({ value: ROWS }) }`):

```ts
test('pending: the session account held and declined orders, labelled, newest first', async () => {
  // ROWS: one 775000000 (no comment), one 775000002 with chp_comment 'Please settle the past due first.'
  expect(JSON.parse(await load(server).get())).toEqual([
    { id: 'r-2', submitted: '2026-10-28T03:00:00Z', po: 'PO-8902', site: 'PLANT3', est: 215000, status: 'Awaiting credit approval', reason: 'Account has a past due balance', comment: '' },
    { id: 'r-1', submitted: '2026-10-27T03:00:00Z', po: '', site: '65072350', est: 76500, status: 'Declined', reason: 'Order exceeds available credit', comment: 'Please settle the past due first.' },
  ])
  expect(reads[0].set).toBe('chp_creditapprovals')
  expect(reads[0].query).toContain('_chp_account_value eq acc-2')
  expect(reads[0].query).toContain('chp_status ne 775000001')
  expect(reads[0].query).toContain('$orderby=createdon desc')
})
test('pending: never reads BC orders, and a blocked contact gets {blocked}', async () => { /* no mcrmSalesOrders GET; blocked → { blocked: true } */ })
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `pendingList(scope)` inside `scopedRead`: `RetrieveMultipleRecords("chp_creditapprovals", "$select=chp_creditapprovalid,createdon,chp_poref,chp_site,chp_estimatedtotal,chp_status,chp_reason,chp_comment&$filter=_chp_account_value eq " + scope.accountId + " and chp_status ne 775000001&$orderby=createdon desc", true)`; map to the DTO (`Number(...) || 0`, `|| ""`, status 775000002 → `'Declined'`, else `'Awaiting credit approval'`). Only session GUIDs and fixed numbers go in the filter. `param("view") === "pending"` routes to it.
- [ ] **Step 4: Run** `npx vitest run test/server-logic` → PASS.
- [ ] **Step 5: Commit** — `S3-11: orders?view=pending lists the account's held and declined credit orders`.

---

### Task 4: New Order — Credit enabled, past-due warning, submit outcomes

**Files:**
- Modify: `src/api/types.ts` (`OrderSubmitRequest.paymentMethod: 'cash' | 'credit'`; `OrderSubmitDto = { so: string; autoApproved?: true } | { pending: true } | { notPriced: true }`; add `PendingOrderDto`)
- Modify: `src/modules/orders/new/form.ts` (`submitRequest` sends `form.paymentMethod`; drop the "Cash only" comments)
- Modify: `src/modules/orders/new/FulfillmentCard.tsx` (Credit enabled)
- Modify: `src/modules/orders/new/SummaryCards.tsx` (past-due warning)
- Modify: `src/modules/orders/new/NewOrderPage.tsx` (`submit.onSuccess`)
- Modify: `src/modules/orders/OrdersPage.tsx` (auto-approved note)
- Modify: `src/modules/orders/drafts/draftPayload.ts` (keep Credit)
- Modify: `src/mocks/orders.ts` (POST: credit → `{ pending: true }`)
- Test: `NewOrderPage.test.tsx`, `form.test.ts`, `draftPayload.test.ts`, `OrdersPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 answers.
- Produces: `export interface PendingOrderDto { id: string; submitted: string; po: string; site: string; est: number; status: 'Awaiting credit approval' | 'Declined'; reason: string; comment: string }`. Navigation: auto-released → `navigate('/orders', { state: { submitted: so, autoApproved: true } })`; held → `navigate('/orders/pending', { state: { sentForReview: true } })` after invalidating `['orders']` (prefix covers `['orders', 'pending']`).

- [ ] **Step 1: Write/adjust failing tests**
  - `NewOrderPage.test.tsx`: replace *"Cash with Prepayment terms; Credit is listed but not available yet"* with *"Credit can be chosen and shows Payment terms"* (option not `aria-disabled`; `Payment terms` field visible). Replace *"a cash order over the available credit shows no credit warning"*'s Phase-2 comment only (behaviour stays). Add: *"credit with a past due balance shows the past-due warning"* (dashboard `overdue: 24750` → text of the Global Constraints warning); *"cash never shows the past-due warning"*; *"a held credit order opens Pending Approval and removes its draft"* (answer `{ pending: true }` → location `/orders/pending`, draft DELETE called); *"an auto-released credit order opens Orders with the auto-approved note"* (answer `{ so: 'SOR000000030', autoApproved: true }`); the submit request body test now expects `paymentMethod: 'credit'` when Credit is chosen.
  - `form.test.ts`: `submitRequest` keeps `paymentMethod: 'credit'`.
  - `draftPayload.test.ts`: rename the 2026-10-26 test to *"a draft saved before 2026-10-26: an old time window becomes 8:00 AM – 5:00 PM; Credit is kept"*, expecting `paymentMethod` `'credit'`.
  - `OrdersPage.test.tsx`: state `{ submitted: 'SOR000000030', autoApproved: true }` → `"SOR000000030 was auto-approved — within available credit, no past due balance."`; plain `{ submitted }` still `"… was submitted."`.
- [ ] **Step 2: Run** `npx vitest run src/modules/orders` → the new/changed tests FAIL.
- [ ] **Step 3: Implement** the file changes listed above. Past-due warning: shown when `paymentMethod === 'credit' && (credit?.overdue ?? 0) > 0`, same `<p>` style as the over-credit warning, rendered before it. The Submit button keeps its label. The OrdersPage note picks its text from `autoApproved`.
- [ ] **Step 4: Run** `npx vitest run src` → PASS.
- [ ] **Step 5: Commit** — `S3-04: New Order submits Credit; past-due warning; auto-approved and held outcomes`.

---

### Task 5: Pending Approval tab

**Files:**
- Create: `src/modules/orders/PendingApprovalPage.tsx`
- Create: `src/modules/orders/PendingApprovalPage.test.tsx`
- Modify: `src/modules/orders/useOrders.ts` (`usePendingOrders`)
- Modify: `src/modules/orders/OrdersSection.tsx` (tab after Drafts, route `pending`; drop the "joins when built" comment)
- Modify: `src/mocks/orders.ts` (`query.view === 'pending'` → the wireframe's `PENDING` sample as `PendingOrderDto[]`)
- Test: `OrdersSection.test.tsx` (tab order)

**Interfaces:**
- Consumes: `PendingOrderDto` (Task 4), `GET orders?view=pending` (Task 3), `SiteCell`, `StatusPill` (`tone`), `useSites`, `formatDate`, `peso`, shadcn `Table`, `QueryError`, `Skeleton`, `SectionCard`, `PageHeader`.
- Produces: `usePendingOrders()` → `useQuery({ queryKey: ['orders', 'pending'], queryFn: () => serverLogic<PendingOrderDto[]>('orders', { query: { view: 'pending' } }) })` (match how `useBlanketOrders` passes its query).

- [ ] **Step 1: Write failing tests** (`PendingApprovalPage.test.tsx`, RTL + `userEvent`, mock boundary = `serverLogic`):
  - *"lists held and declined orders with reason and the credit team's comment"*: columns `Submitted`, `PO reference`, `Delivery site`, `Estimated total`, `Status`, `Why it needs review`; a declined row shows `Declined` and `Credit team: Please settle the past due first.`; an awaiting row shows `Awaiting credit approval`; `₱215,000.00`; empty PO shows `—`.
  - *"after a held submit, says it was sent to the credit team"* (router state `{ sentForReview: true }` → `"Your order was sent to our credit team for review."`).
  - *"empty"* → `"No orders are waiting for approval."`; *"loading"* → `status` skeleton; *"error"* → Retry refetches.
  - *"sets the page title"* → `document.title === 'Pending Approval — Concreat Connect'`.
  - *"has no row actions"* → no buttons in rows.
  - `OrdersSection.test.tsx`: tabs read `Orders, Blanket Orders, New Order, Drafts, Pending Approval`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the page to the wireframe's `#panel-pending` (table inside `SectionCard`, like `DraftsPage`); Status pill tone `warn` for awaiting, `bad` for declined; site via `SiteCell`; the comment as a muted second line in the reason cell. Note under the header like `OrdersPage`'s submitted note.
- [ ] **Step 4: Run** `npx vitest run src` → PASS; `npm run lint` → no errors.
- [ ] **Step 5: Commit** — `S3-11: Pending Approval tab`.

---

### Task 6: Cloud flow "Concreat Connect – Credit approval"

**Files:**
- Create: `scripts/dataverse/credit_approval_flow.json`
- Modify: `scripts/dataverse/portal_flows.py` (REFS: `'shared_approvals': ('chp_approvals', 'Concreat Hub – Approvals')`; `--approvals-connection` arg created like `--outlook-connection`; FLOWS entry `('CREDIT_APPROVAL', 'Concreat Connect – Credit approval', 'credit_approval_flow.json', 'Credit orders held by the portal: Outlook approval by the credit team, BC order on Approve. S3-04.')`)

**Interfaces:**
- Consumes: Task 1 table/env var; Task 2 payload shape; env vars `chp_BCTenantId`, `chp_BCEnvironmentName`, `chp_BCApiBasePath`, `chp_BCClientId`, `chp_BCClientSecret`, `chp_SenderMailbox`.

- [ ] **Step 1: Write the definition** (copy BC token/URL actions from `activation_flow.json`; trigger shape from `grant_flow.json`):
  1. Trigger `SubscribeWebhookTrigger`, `entityname: chp_creditapproval`, message `1` (Create), scope `4`.
  2. `Payload` = `json(triggerOutputs()?['body/chp_payload'])`; Get contact (`_chp_contact_value`) and account (`_chp_account_value`) rows for names.
  3. `StartAndWaitForAnApproval`, `approvalType: Basic` (First to respond), `assignedTo` = `parameters('Credit Approval Group (chp_CreditApprovalGroup)')`, title `Credit approval: <account name> (<customer no. from Payload.salesOrder.sellToCustomerNo>) — ₱<chp_estimatedtotal>`, details Markdown per spec §4 (company id, customer, submitted by, PO ref, shipment method, site, date, lines table from `Payload.lines`, estimated total, available credit, overdue, reason). No item link. No timeout setting.
  4. Condition on `outcome` = `Approve`:
     - Yes: update row (`chp_status` 775000001, approver name/email, comments, `chp_decidedon` = completion date); Get row again; if `chp_salesorderno` not empty → Terminate Succeeded; BC token; HTTP POST `…/companies(<Payload.companyId>)/mcrmSalesOrders` with body `Payload.salesOrder`, **retryPolicy none**; on success update `chp_salesorderno`; on failure (runAfter Failed/TimedOut) `SendEmailV2` from `chp_SenderMailbox` to the group: subject `Approved credit order couldn't be created in Business Central`, body naming customer, PO ref, estimated total and the BC error, then Terminate Failed.
     - No: update row (`chp_status` 775000002, approver, comments, decided on).
  5. No customer email anywhere.
- [ ] **Step 2: Deploy to Dev** — `pac auth who` (Dev); create an Approvals connection in the Dev environment once (make.powerautomate.com → Connections → Approvals) as the flow owner; `python scripts/dataverse/portal_flows.py --approvals-connection <name> --only CREDIT_APPROVAL`. Expected: `+ CREDIT_APPROVAL: flow <id>`, `on, in ConcreatHub: True`.
- [ ] **Step 3: Check in Dev** (manual, with the CHP Credit Team mailbox): submit a held credit order on Dev (or create a `chp_creditapproval` row by hand with a payload from Task 2's test) → an Outlook approval reaches a group member; **Approve** → one BC order with `paymentMethodCode CREDIT`, status Open, row has `chp_salesorderno`; **resubmit that run** from run history → the run terminates at the guard and BC has no second order; another row **Reject** with a comment → row Declined with the comment, BC untouched.
- [ ] **Step 4: Commit** — `S3-04: credit approval flow (Outlook approval, BC order on Approve)`.

---

### Task 7: Docs, deploy and end-to-end check on Dev

**Files:**
- Modify: `docs/Concreat_Hub_Architecture.md` (§5 Pending Approval source = Dataverse; §7 sequence and D1 decided as in the spec; §8 row; decisions table)
- Modify: `docs/Concreat_Hub_Implementation_Plan.md` (S3-04 owner PP, Release 1, status; S3-11 status; S3-10 note: credit added, `CREDIT` confirmed; open question 5 resolved)
- Modify: `PLANS.md` only if the user asks (it's their file).

- [ ] **Step 1: Update the two docs** as listed; reference S3-04/S3-11.
- [ ] **Step 2: Full checks** — `npm test`, `npm run lint`, `npm run build`, `git diff --check` → all pass.
- [ ] **Step 3: Deploy** — `pac auth who` shows Dev → `npm run deploy`.
- [ ] **Step 4: Dev end-to-end** (Playwright MCP or by hand, test customer on Dev): Credit within credit → Orders shows the auto-approved note and the order; Credit with a past-due customer → Pending Approval row with reason, approval in Outlook; Approve → row leaves Pending Approval, order under Orders; Reject → Declined with comment; Cash order → unchanged.
- [ ] **Step 5: Commit** — `S3-04/S3-11: architecture D1 decided (Dataverse + Power Automate Approvals), plan status`.
