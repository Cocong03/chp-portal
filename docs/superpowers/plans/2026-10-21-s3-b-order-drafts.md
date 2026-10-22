# S3-B Order Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save the New Order form as a personal draft in Dataverse and list, continue and delete drafts on a new Drafts tab (S3-12).

**Architecture:** Dataverse table `chp_orderdraft` (Contact-scope table permission) behind one Server Logic endpoint `drafts` (GET/POST/PUT/DELETE) that sets the owner from the session. The SPA calls it through `serverLogic()`; a stateful dev mock answers on localhost. Drafts store form choices only; Est. total and Continue use the current `order-options`.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, React Hook Form, react-router-dom, shadcn (Dialog, Table), Sonner, Vitest + RTL; Power Pages Server Logic; Python Dataverse scripts.

**Spec:** `docs/superpowers/specs/2026-10-21-s3-b-order-drafts-design.md`

## Global Constraints

- Drafts never call BC order APIs or the credit check; `drafts` Server Logic only uses `sessionScope()` (the access check) and `Server.Connector.Dataverse`.
- Owner (`chp_contact`) and account (`chp_account`) come from the session only; the server ignores `contact`, `account`, `label` in any request body.
- Only the saving contact sees a draft; list filter = session contact **and** session account.
- A draft stores `NewOrderForm` choices only, never prices, freight or credit.
- Server Logic: no `require`/`import`, `eval`, `setTimeout`, `delete`, `prototype`, `Reflect.`, `with(`; arrow callbacks only; helpers stamped by `node scripts/stamp-server-logic-helpers.mjs`, never hand-edited.
- Web roles on the Server Logic record and the table permission: Full Access `56b29291-b981-4ef0-865b-41c1e9523a97`, Orders & Delivery `11bb7218-55fb-4cae-b8a1-5af2f41237c5`.
- Copy, exact: tab **Drafts**; columns **Draft**, **Last saved**, **Delivery site**, **Est. total**; buttons **Continue**, **Delete**, **+ New Order**; empty *No saved drafts. Start a new order and choose "Save as draft" to come back to it later.*; dialog **Delete this draft?** / *This cannot be undone, are you sure you want to proceed?* / **Cancel** / **Delete draft**; notes *Saved as draft. You may go to the Drafts tab to edit, or delete.*, *Continuing Draft #2, saved Oct 21, 2026.*, *This draft is no longer available.*; page title "Drafts — Concreat Connect".
- Dataverse changes go to **Dev only**, in solution `ConcreatHub`. Deploy only via `npm run deploy` (checks Dev org `https://org380257ac.crm5.dynamics.com/`).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Sites still loading or failed when continuing a draft → the saved site is kept, never cleared (Task 2 test `keeps the saved site when sites are unavailable`).
2. Continuing a draft whose site is empty → it stays empty, the default site is not filled in (Task 4 test `a draft without a site is not given the default`).
3. Saving a continued draft that was deleted elsewhere → a new draft is created, nothing typed is lost (Task 4 test `saving a draft deleted elsewhere creates a new one`).
4. Clicking the New Order tab while continuing a draft → a fresh empty form, later saves create a new draft (Task 4 test `the New Order tab starts a fresh form`).
5. Malformed or oversized payload, foreign or non-GUID id sent to `drafts` → 400 / not found, nothing written (Task 1 review checklist; live check in Task 5).

---

### Task 1: Dataverse table, table permission and `drafts` Server Logic

**Files:**
- Create: `scripts/dataverse/orderdraft_schema.py`
- Create: `.powerpages-site/table-permissions/Order-draft-own-(CRUD).tablepermission.yml`
- Create: `.powerpages-site/server-logic/drafts/drafts.js`, `.powerpages-site/server-logic/drafts/drafts.serverlogic.yml`

**Interfaces:**
- Produces (HTTP, `/_api/serverlogics/drafts`): `GET` → `DraftDto[]`; `GET ?id=` → `DraftDto | {notFound:true}`; `POST {payload}` → `DraftDto | {invalid:true}`; `PUT ?id= {payload}` → `DraftDto | {notFound:true} | {invalid:true}`; `DELETE ?id=` → `{deleted:true} | {notFound:true}`. `DraftDto = { id, label, savedAt (ISO modifiedon), payload }`.

- [ ] **Step 1: Write `orderdraft_schema.py`** (pattern: `announcement_schema.py`; imports from `identity_schema`): `ensure_table('chp_OrderDraft', 'Order Draft', 'Order Drafts', 'Personal New Order drafts (S3-12). Never sent to BC.', text('chp_Name', 'Name', 100, is_required=True, primary=True))`; `ensure_lookup('chp_orderdraft', 'chp_Contact', 'Contact', 'contact', 'chp_contact_chp_orderdraft', True, 'Cascade')`; `ensure_lookup('chp_orderdraft', 'chp_Account', 'Account', 'account', 'chp_account_chp_orderdraft', True, 'Restrict')`; Memo `chp_Payload` ('Payload', MaxLength 100000); `PublishXml` for `chp_orderdraft`.

- [ ] **Step 2: Run it against Dev**

Run: `cd scripts/dataverse && python orderdraft_schema.py`
Expected: prints `Order Draft`, `Publishing`, `Done.`; a second run also succeeds (idempotent). Confirm with the Dataverse MCP `describe` on `chp_orderdraft`: columns `chp_name`, `chp_contact`, `chp_account`, `chp_payload` exist and the table is in solution `ConcreatHub`.

- [ ] **Step 3: Table permission YAML** — fields as in `Contact-self-(read).tablepermission.yml` plus `contactrelationship: chp_contact_chp_orderdraft`; `entitylogicalname: chp_orderdraft`, `entityname: Order draft - own (CRUD)`, `scope: 756150001` (Contact), `read/create/write/delete: true`, `append: true`, `appendto: false`, roles = the two GUIDs in Global Constraints, a new `id` GUID.

- [ ] **Step 4: Server Logic `drafts`** — header comment like `sites.js`. Four functions `get`, `post`, `put`, `del`, each with its own empty bc-helpers region (`// #region bc-helpers …` / `// #endregion bc-helpers`) then its body in `respond(async () => { var scope = await sessionScope(); … })`. Inside each function (Server Logic has no shared top-level code) define what it needs from:
  - `GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`; a non-matching `Server.Context.QueryParameters["id"]` → `{ notFound: true }`.
  - `toDto(row)` → `{ id: row.chp_orderdraftid, label: row.chp_name, savedAt: row.modifiedon, payload: JSON.parse(row.chp_payload || "{}") }`.
  - `ownDraft(scope, id)`: `RetrieveRecord("chp_orderdrafts", id, "$select=chp_orderdraftid,chp_name,chp_payload,modifiedon,_chp_contact_value")` through `parseResult`; a failed read or `_chp_contact_value !== scope.contactId` → `null`.
  - `readPayload()`: parse `Server.Context.Body`, take `.payload`; it must be a non-array object with `version === 1` and `JSON.stringify(payload).length <= 100000`, else the method answers `{ invalid: true }` without writing (like `{ notFound: true }`, so `respond` stays unchanged); the SPA's `saveDraft` turns it into an `ApiError(400)` and shows its save toast.
  - `get`: with `id` → `ownDraft` → `toDto` or `{notFound:true}`; else `RetrieveMultipleRecords("chp_orderdrafts", "$select=…&$filter=_chp_contact_value eq " + scope.contactId + " and _chp_account_value eq " + scope.accountId + "&$orderby=modifiedon desc")` → `value.map(toDto)`.
  - `post`: N = 1 + max of `/^Draft #(\d+)$/` over this contact's draft names (any account); `CreateRecord("chp_orderdrafts", JSON.stringify({ chp_name: "Draft #" + N, chp_payload: JSON.stringify(payload), "chp_Contact@odata.bind": "/contacts(" + scope.contactId + ")", "chp_Account@odata.bind": "/accounts(" + scope.accountId + ")" }))`; then read it back (id from the create answer; log its shape on first Dev run if it isn't the record) → `toDto`.
  - `put`: `ownDraft` or `{notFound:true}`; `UpdateRecord("chp_orderdrafts", id, JSON.stringify({ chp_payload }))`; read back → `toDto`.
  - `del`: `ownDraft` or `{notFound:true}`; `DeleteRecord("chp_orderdrafts", id)` → `{ deleted: true }`.
  - `drafts.serverlogic.yml`: the two role GUIDs, `description: 'Signed-in contact''s own New Order drafts in Dataverse: list, read, create, update, delete (S3-12)'`, `display_name: 'Drafts (New Order)'`, new `id`, `name: drafts`.

- [ ] **Step 5: Stamp and check**

Run: `node scripts/stamp-server-logic-helpers.mjs && node scripts/stamp-server-logic-helpers.mjs --check && node --check .powerpages-site/server-logic/drafts/drafts.js && grep -nE "require\(|import |eval|setTimeout|delete |prototype|Reflect\.|with\(" .powerpages-site/server-logic/drafts/drafts.js`
Expected: `stamped: …drafts.js`, check exits 0, syntax OK, the grep prints nothing except `DeleteRecord` (allowed: it's not the `delete` operator).

- [ ] **Step 6: Commit**

```bash
git add scripts/dataverse/orderdraft_schema.py .powerpages-site/table-permissions .powerpages-site/server-logic/drafts
git commit -m "S3-12: chp_orderdraft table (Dev), Contact-scope permission and drafts Server Logic"
```

### Task 2: Draft types, payload rules, dev mock and query hooks

**Files:**
- Modify: `src/api/types.ts` (add `DraftPayload`, `DraftDto`)
- Create: `src/modules/orders/drafts/draftPayload.ts`, `draftPayload.test.ts`
- Create: `src/mocks/drafts.ts`; Modify: `src/mocks/index.ts` (register `drafts: draftsMock`)
- Create: `src/modules/orders/drafts/useDrafts.ts`

**Interfaces:**
- Consumes: `NewOrderForm`, `newOrderDefaults(options, sites)` (`src/modules/orders/new/form.ts`); `OrderOptionsDto`, `SiteDto`.
- Produces:
  - `interface DraftPayload { version: 1; orderType: 'single' | 'blanket'; form: NewOrderForm }`; `interface DraftDto { id: string; label: string; savedAt: string; payload: DraftPayload }` (types.ts).
  - `toPayload(form: NewOrderForm): DraftPayload`
  - `fromDraft(payload: DraftPayload, options: OrderOptionsDto, sites: SiteDto[] | undefined): NewOrderForm` — `sites` undefined = not available.
  - `estTotal(payload: DraftPayload, options: OrderOptionsDto): number`
  - `draftsMock(request: MockRequest)`, `resetDraftsMock(): void` (restores the one sample draft; tests call it in `beforeEach`).
  - `useDrafts()` → `useQuery(['drafts'])`; `useDraft(id: string | null)` → `useQuery(['drafts', id], enabled: !!id)` returning `DraftDto | null` (null for `{notFound:true}`); `saveDraft(id: string | null, form: NewOrderForm): Promise<DraftDto>` (PUT when id, falling back to POST on `{notFound:true}`; POST otherwise); `useDeleteDraft()` → `useMutation` that DELETEs and invalidates `['drafts']`.

- [ ] **Step 1: Write the failing tests** in `draftPayload.test.ts` (use `ORDER_OPTIONS_SAMPLE` and the dev `sites` mock values):

```ts
test('fromDraft restores every saved choice')                 // all NewOrderForm fields equal the saved ones
test('items, site and plant that no longer exist come back empty') // code 'GONE' → '', site 'OLD' → '', source 'PLANTX' → ''
test('keeps the saved site when sites are unavailable')        // fromDraft(p, options, undefined).site === 'PLANT2'
test('a draft without a site stays without one')               // saved site '' → '' even though PLANT1 is default
test('ignores unknown and wrongly typed keys')                 // form.qtyX ignored; callBefore: 'yes' → default false
test('no saved lines gives one empty line')                    // lines [] → [{ code: '', qty: 1 }]
test('estTotal = current prices × qty + freight for the shipment method + other charges') // CEM-T1-40KG ×10 pickup → 2450; delivery → 2450 + 3500
test('estTotal skips lines whose item no longer exists')
test('toPayload wraps the form with version 1 and its orderType')
```

- [ ] **Step 2: Run** `npx vitest run src/modules/orders/drafts/draftPayload.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `draftPayload.ts`.** `fromDraft`: start from `newOrderDefaults(options, sites ?? [])`; take each saved key whose `typeof` matches the default's; then lines (array of `{code, qty}`; unknown code → `''`; empty → default line), `site` (sites undefined → saved value; else saved if in `sites`, else `''`; never the default), `source` (in `options.plants` or `''`), `paymentMethod` (`'cash' | 'credit'` or default). `estTotal` uses `lineAmount` from `form.ts` plus `options.freight[shipmentMethod]` and `options.otherCharges`.

- [ ] **Step 4: Run** the same command — Expected: 9 passed.

- [ ] **Step 5: Mock + hooks.** `src/mocks/drafts.ts`: module-level array seeded with one sample (`Draft #1`, savedAt `2026-10-20T09:15:00Z`, site `PLANT2`, delivery, one line `CEM-T1-40KG` × 10); answers by `request.method` exactly like Task 1's table (POST numbers by max + 1, newest `savedAt` first on GET). `useDrafts.ts` per the Interfaces block; `saveDraft` uses `serverLogic` directly (the caller wraps it in a mutation).

- [ ] **Step 6: Run** `npx vitest run src/modules/orders src/mocks && npm run lint` — Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/api/types.ts src/modules/orders/drafts src/mocks
git commit -m "S3-12: draft payload rules (stale choices, current-price Est. total), dev mock and query hooks"
```

### Task 3: Drafts tab

**Files:**
- Create: `src/modules/orders/drafts/DraftsPage.tsx`, `DraftsPage.test.tsx`
- Modify: `src/modules/orders/OrdersSection.tsx` (tab + badge + route), `src/modules/orders/OrdersSection.test.tsx`

**Interfaces:**
- Consumes: `useDrafts`, `useDeleteDraft`, `estTotal` (Task 2); `useOrderOptions`, `useSites`; `formatDate`, `peso`; `QueryError`, `PageHeader`, `Skeleton`, shadcn `Dialog`, `Table`, `Button`.
- Produces: route `/orders/drafts` → `DraftsPage`; Continue links to `/orders/new?draft=<id>`.

- [ ] **Step 1: Write the failing tests** (`DraftsPage.test.tsx`, `renderApp(<OrdersSection />, { route: '/orders/drafts' })`, `resetDraftsMock()` in `beforeEach`, `vi.mock('sonner', …)` as in `OrdersPage.test.tsx`):

```ts
test('lists drafts newest first with label, Single tag, last saved, site name and Est. total') // 'Draft #1', 'Single', 'Oct 20, 2026', 'Plant 2 — North Depot', '₱5,950.00'
test('a site that no longer exists shows —')
test('shows the empty message when there are no drafts')
test('a failed list shows the error with Retry')
test('Continue opens New Order with the draft')                  // link href '/orders/new?draft=<id>'
test('Delete asks first; Cancel keeps the draft')
test('Delete draft removes it and updates the badge')            // badge in the Drafts tab goes 1 → hidden
test('a failed delete keeps the row and shows the toast')        // toast.error("We couldn't delete this draft. Please try again.")
test('sets the page title')                                      // 'Drafts — Concreat Connect'
```
`OrdersSection.test.tsx`: tabs read `Orders`, `New Order`, `Drafts 1` in that order; `/orders/drafts` marks Drafts current.

- [ ] **Step 2: Run** `npx vitest run src/modules/orders/drafts/DraftsPage.test.tsx src/modules/orders/OrdersSection.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement.** `OrdersSection`: add `{ label: 'Drafts', to: '/orders/drafts', end: false }` after New Order, badge `<span>` with the count from `useDrafts().data?.length` when > 0 (wireframe `.tab-badge`), route `drafts`. `DraftsPage`: `usePageTitle('Drafts')`; panel head with **+ New Order** (`<Button asChild><Link to="/orders/new">`); shadcn `Table` with the spec's columns; Est. total `—` until options load; delete Dialog with the spec copy; toast text `We couldn't delete this draft. Please try again.`

- [ ] **Step 4: Run** the same command — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/orders
git commit -m "S3-12: Drafts tab (list, Est. total from current prices, Continue, Delete with confirmation, tab badge)"
```

### Task 4: Save as draft and Continue on New Order

**Files:**
- Modify: `src/modules/orders/new/NewOrderPage.tsx`, `src/modules/orders/new/SummaryCards.tsx`, `src/modules/orders/new/NewOrderPage.test.tsx`

**Interfaces:**
- Consumes: `useDraft`, `saveDraft`, `fromDraft`, `toPayload` (Task 2); `withAutoLine`.
- Produces: `SummaryCards` gains `onSaveDraft: () => void` and `saving: boolean`; Save as draft is a real button, Submit stays `Soon`.

- [ ] **Step 1: Write the failing tests** (add to `NewOrderPage.test.tsx`; `resetDraftsMock()` in `beforeEach`; render `OrdersSection` at the route where tabs matter):

```ts
test('Save as draft creates a draft and shows the saved note') // note text exact; serverLogic called with ('drafts', { method: 'POST' … })
test('saving again updates the same draft')                     // second save → method 'PUT', mock holds 2 drafts total (seed + 1)
test('Continue fills every field from the draft')               // route '/orders/new?draft=<seed id>': site PLANT2, Delivery pressed, line CEM-T1-40KG ×10, note 'Continuing Draft #1, saved Oct 20, 2026.'
test('a draft without a site is not given the default')         // seed a draft with site '' → Delivery site select shows no value
test('keeps the saved site when sites fail')                    // answer('sites', new ApiError(500,'x')) → after save, payload site still 'PLANT2'
test('a missing draft opens an empty form with a note')         // '?draft=<unknown guid>' → 'This draft is no longer available.'
test('saving a draft deleted elsewhere creates a new one')      // delete the seed in the mock after opening, save → POST follows PUT, saved note shown
test('a failed save keeps the form and shows the toast')        // toast.error("We couldn't save this draft. Please try again."), qty still typed
test('the New Order tab starts a fresh form')                   // from '?draft=…' click tab 'New Order' → empty line, next save is POST
test('Submit for approval stays disabled')
```

- [ ] **Step 2: Run** `npx vitest run src/modules/orders/new/NewOrderPage.test.tsx` — Expected: the new tests FAIL, the existing ones pass.

- [ ] **Step 3: Implement.**
  - `NewOrderPage` reads `draft` from `useSearchParams()`. With a draft id it waits for options, the draft query, and sites (data **or** error) before rendering the form; without one it keeps today's options-only gate. Form initial values: `fromDraft(draft.payload, options, sites.data)` when the draft exists, `newOrderDefaults` otherwise. `OrderForm` gets `key={draftId ?? 'new'}` so the New Order tab (no param) remounts a fresh form; the default-site effect runs only when there is no draft id.
  - Save: `setValue('instructions', withAutoLine(...))` first, then `saveDraft(currentId, getValues())` inside `useMutation`. On success: `queryClient.setQueryData(['drafts', dto.id], dto)`, invalidate `['drafts']`, and if the id is new `navigate({ search: '?draft=' + dto.id }, { replace: true, state: { saved: true } })` (the remount refills from the seeded cache); the note reads the saved text when `location.state?.saved` or after an in-place save. Button disabled + "Saving…" while pending. Error toast text `We couldn't save this draft. Please try again.`
  - Notes (in the existing note slot style, `text-[12.5px]`, above the cards): continuing / saved / no longer available, per Global Constraints.
  - `SummaryCards`: replace `<Soon>Save as draft</Soon>` with a `Button type="button"` calling `onSaveDraft`; update the `Soon` comment (only Submit, S3-10).

- [ ] **Step 4: Run** `npx vitest run src/modules/orders` — Expected: all pass.

- [ ] **Step 5: Full checks**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/modules/orders
git commit -m "S3-12: Save as draft and Continue on New Order (update in place, stale choices, deleted-draft fallback)"
```

### Task 5: Deploy to Dev, live check, plan rows

**Files:**
- Modify: `docs/Concreat_Hub_Implementation_Plan.md` (S3-12 row; S3-07 note "Save as draft live")

- [ ] **Step 1: Deploy** — `pac auth who` shows `https://org380257ac.crm5.dynamics.com/`; run `npm run deploy`. Expected: "Upload complete".

- [ ] **Step 2: Live check on Dev** (Playwright MCP or the user, with two test users on the same account): save a draft, see it on Drafts, Continue, change qty, save (same draft, Last saved updates), delete it; user B on the same account sees none of user A's drafts. Server Logic log shows no errors. If the create answer's shape needed a fix in Task 1 step 4, commit it here.

- [ ] **Step 3: Plan rows** — S3-12 status `🟡 Deployed to Dev` with a dated note (spec path, Server Logic `drafts`, table `chp_orderdraft`, Contact scope). Run `git diff --check`.

- [ ] **Step 4: Commit**

```bash
git add docs/Concreat_Hub_Implementation_Plan.md
git commit -m "S3-12: plan row (Drafts deployed to Dev)"
```
