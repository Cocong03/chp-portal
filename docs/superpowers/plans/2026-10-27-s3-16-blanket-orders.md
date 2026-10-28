# S3-16 Blanket Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blanket Orders tab + View + Manage schedule (UI only) on BC's Blanket Sales Orders, and a Blanket Order mode on New Order with customer-typed unit prices, a delivery schedule and drafts. Blanket submit stays disabled.

**Architecture:** The `orders` Server Logic GET gains `type=blanket` (list + detail, session-scoped, `documentType eq 'Blanket_x0020_Order'`). The SPA adds `/orders/blanket`, a blanket flavour of `OrderDialog`, one shared `ScheduleEditor` used by both the Manage schedule dialog and New Order's Delivery schedule card, and Blanket-mode pricing in `OrderLinesCard`/`SummaryCards`/Drafts. Nothing new reaches BC or monday.com.

**Tech Stack:** Power Pages Server Logic (plain JS, no modules), React 19 + TypeScript, react-hook-form, TanStack Query 5, shadcn/ui, Tailwind v4, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-10-27-s3-16-blanket-orders-design.md` (read it; decision numbers below refer to it)

## Global Constraints

- Copy exactly as the wireframe/spec; never show `Blanket_x0020_Order`, `documentType` or other BC names in the UI.
- Server scope from the session only (`sessionScope()`/`scopedRead`); escape every user value in `$filter` with `odataLiteral`; ignore customer/company ids from the request.
- Don't hand-edit the `#region bc-helpers` block in `orders.js` (it is stamped from `server-logic-src/bc-helpers.js`).
- Server Logic: no `require`/`import`, `eval`, `setTimeout`, `delete`, `prototype`, `Reflect.`.
- SPA only sums for display (decision 9). No network call on Save schedule (decision 3). Blanket Submit disabled (decision 1).
- `document.title` via `usePageTitle('Blanket Orders')` → "Blanket Orders — Concreat Connect".
- shadcn/ui components from `src/ui`, DESIGN.md tokens; match surrounding code style (single quotes in `src/modules/orders/new`, double quotes in `OrdersPage.tsx`/`OrderDialog.tsx`).
- Run checks: targeted Vitest while iterating; before handoff `npm test`, `npm run lint`, `npm run build`.

## Review Focus

1. A draft saved before this change (no `price`, no `schedule`) or with a malformed `schedule`/`orderType` reopens without crashing, as Single with an empty schedule → test in Task 5 (`draftPayload.test.ts`).
2. Blanket line with empty, 0 or negative price → Line total "—", Subtotal and Order total "—" → test in Task 5.
3. A schedule row whose item was removed from the order lines → it no longer counts in the per-item footer and its select shows the placeholder → test in Task 3 (`scheduleSummary`) and Task 5.
4. A BSO with no lines from BC → Manage schedule shows "No items on this Blanket Order.", Add delivery and Save schedule disabled → test in Task 4.
5. Typing prices in Blanket mode, then switching back to Single → BC's prices show again and the Single submit body has no `price` → test in Task 5.

---

### Task 1: `orders` GET `type=blanket` (Server Logic)

**Files:**
- Modify: `.powerpages-site/server-logic/orders/orders.js` (GET function only: `owned()` ~line 388, `detail()` ~445, dispatch ~568)
- Modify: `.powerpages-site/server-logic/orders/orders.serverlogic.yml` (`description`)
- Modify: `docs/Concreat_Hub_Architecture.md` (§5 row "Blanket Orders tab / Blanket entry" ~line 175, endpoint table `blanket-orders` row ~209, BC API row "Blanket Sales Orders + schedule + remaining qty" ~278)
- Modify: `docs/pending from bc.txt` (add the `unitPrice` ask)
- Test: `test/server-logic/orders.test.ts`

**Interfaces:**
- Produces: `GET orders?type=blanket` → `{ orders: OrderSummaryDto[] }`; `GET orders?type=blanket&id=<BSO>` → `OrderDto` or `{ notFound: true }`. Any other `type` = today's behaviour.

- [ ] **Step 1: Write the failing tests** in `test/server-logic/orders.test.ts`, with fixture `BLANKET = { ...ORDER, salesOrderNo: 'BSO0000000002', documentType: 'Blanket_x0020_Order', externalDocumentNo: 'PO-B', totalAmountInclVAT: 150 }`, constant `BLANKET_BASE = "sellToCustomerNo eq 'C00000002' and documentType eq 'Blanket_x0020_Order'"`:
  - `'type=blanket lists the session customer's blanket orders newest first, capped at 200'`: `query: { type: 'blanket' }, orders: [BLANKET]` → body equals `{ orders: [{ so: 'BSO0000000002', date: '2026-10-09', po: 'PO-B', site: '65072350', ship: null, bso: null, trip: null, edd: null, total: 150, status: 'Open' }] }`; the one `orderCalls` URL contains `$filter=${BLANKET_BASE}&`, `$orderby=orderDate desc,salesOrderNo desc`, `$top=200`; `archiveCalls(http)` is empty.
  - `'type=blanket ignores status, site, dates, search, page, all and a customer in the request'`: `query: { type: 'blanket', status: 'Open', site: 'X', from: '2026-01-01', q: 'abc', page: '3', all: 'true', customerNo: 'C9' }` → the call's `$filter` is exactly `BLANKET_BASE`, `$top=200`.
  - `'type=blanket drops rows for another customer or that are not blanket orders'`: `orders: [BLANKET, { ...BLANKET, salesOrderNo: 'BSO9', sellToCustomerNo: 'C1' }, ORDER]` → only `BSO0000000002`.
  - `'blanket detail returns the BSO with its BC lines'`: `query: { type: 'blanket', id: 'BSO0000000002' }, orders: [BLANKET], lines: [{ ...LINE, documentNo: 'BSO0000000002' }]` → summary + `lines: [{ code: 'CEM-T1-40KG', …, unitPrice: 245, lineTotal: 12250 }]`; call filter `salesOrderNo eq 'BSO0000000002' and sellToCustomerNo eq 'C00000002' and documentType eq 'Blanket_x0020_Order'`; `chpSalesOrderLines?$filter=documentNo eq 'BSO0000000002'` called.
  - `test.each` `'blanket detail of %s → notFound, lines and archive never read'`: another customer (`orders: []`), a row for `C1`, a Sales Order id (`id: 'SOR0000000006', orders: [ORDER]`).
  - `'blanket detail escapes quotes in the id'`: `id: "B'1"` → URL contains `salesOrderNo eq 'B''1'`.
  - Existing `'detail of a blanket order number → notFound'` (no `type`) must still pass unchanged.

- [ ] **Step 2: Run** `npx vitest run test/server-logic/orders.test.ts` — Expected: the new tests FAIL, existing ones pass.

- [ ] **Step 3: Implement in `orders.js` GET**
  - `var BLANKET = "Blanket_x0020_Order";` and `// ponytail: newest 200 blanket orders, no pager (the wireframe has none); page when a customer outgrows it.` `var BLANKET_CAP = "200";`
  - `owned(row, scope, documentType)` — third argument defaults to `"Order"`; existing callers unchanged.
  - `async function blanketList(scope)` → `{ orders }`: one `bcGet` on `mcrmSalesOrders`, `$filter = "sellToCustomerNo eq " + odataLiteral(scope.customerNo) + " and documentType eq '" + BLANKET + "'"`, `$select: ORDER_FIELDS`, `$orderby: "orderDate desc,salesOrderNo desc"`, `$top: BLANKET_CAP`; rows filtered by `owned(row, scope, BLANKET)`, mapped with `toSummary`.
  - `async function blanketDetail(scope, id)`: as `detail()` with `documentType eq BLANKET` and `owned(…, BLANKET)`, lines from `chpSalesOrderLines`, `withLines`; no archive fallback; not found → `{ notFound: true }`.
  - Dispatch: `if (param("type") === "blanket") { return id ? blanketDetail(scope, id) : blanketList(scope); }` before the existing `id`/list branches.
  - yml `description`: `'Signed-in customer''s BC Sales Orders and Blanket Sales Orders (type=blanket, S3-16): list and detail with lines; POST submits a cash New Order (S3-10)'`.

- [ ] **Step 4: Run** `npx vitest run test/server-logic` — Expected: all PASS (includes `bc-helpers.test.ts`, which checks the helper copies are identical).

- [ ] **Step 5: Docs.** Architecture: §175 row → reads via `orders?type=blanket`; §209 replace the `blanket-orders` endpoint row with a note on the `orders` row ("`type=blanket`: Blanket SOs, list + detail"); §278 → "Blanket Sales Orders: Yes (`mcrmSalesOrders`, `documentType` Blanket_x0020_Order) · schedule + remaining qty: No". `docs/pending from bc.txt`: add "Blanket Orders: add a writable `unitPrice` on `mcrmSalesOrderLines`, kept as sent for Blanket Orders (BC prices blanket lines at 0; tested 2026-10-27, BSO000000011 is a test record)".

- [ ] **Step 6: Commit** `git add .powerpages-site/server-logic/orders test/server-logic/orders.test.ts docs/Concreat_Hub_Architecture.md "docs/pending from bc.txt"` · `git commit -m "S3-16: orders GET type=blanket (Blanket Sales Orders list and detail)"`

- [ ] **Step 7 (manual, ask the user; doesn't block later tasks):** in Postman on DEV, `GET …/chpSalesOrderLines?$filter=documentNo eq 'BSO0000000002'` and the same for `BSO000000011`. Record in the spec's probe table whether lines come back and whether staff-created BSO lines carry `unitPrice` (decision 14).

---

### Task 2: SPA data — types, hooks, mocks

**Files:**
- Modify: `src/api/types.ts`, `src/modules/orders/useOrders.ts`, `src/mocks/orders.ts`
- Test: `src/mocks/orders.test.ts` (create) — or extend an existing hook test if one fits

**Interfaces:**
- Produces (in `types.ts`): `export type OrderKind = 'order' | 'blanket'`; `export interface BlanketOrdersDto { orders: OrderSummaryDto[] }`.
- Produces (in `useOrders.ts`): `useBlanketOrders(): UseQueryResult<BlanketOrdersDto>` (key `['blanket-orders']`, `staleTime: 60_000`, query `{ type: 'blanket' }`); `useOrder(id: string | null, kind: OrderKind = 'order')` — key `['order', id]` for `'order'` (unchanged), `['order', 'blanket', id]` for `'blanket'`; blanket passes `{ type: 'blanket', id }`.
- Produces (in `mocks/orders.ts`): `export const MOCK_BLANKET_ORDERS: OrderDto[]` — the wireframe's `BSO-20441`: date `2026-07-10`, edd null, po `PO-8500-B`, site `PLANT1`, status `Open`, ship `Delivery`, bso null, trip null, lines `[CEM-T1-40KG × 2000]` priced from `CATALOG`, total = line sum. `ordersMock` answers `type=blanket` (list `{ orders: summaries }`, detail by id or `{ notFound: true }`) before its other branches.

- [ ] **Step 1: Write the failing test** `'ordersMock answers type=blanket list and detail'`: `ordersMock({ method: 'GET', query: { type: 'blanket' } })` → `{ orders: [expect.objectContaining({ so: 'BSO-20441', total: 2000 * CATALOG['CEM-T1-40KG'].price })] }` with no `lines` key; `{ type: 'blanket', id: 'BSO-20441' }` → has `lines` length 1; `{ type: 'blanket', id: 'SO-100482' }` → `{ notFound: true }`.
- [ ] **Step 2: Run** `npx vitest run src/mocks/orders.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the types, hooks and mock above.
- [ ] **Step 4: Run** `npx vitest run src/mocks src/modules/orders` — Expected: PASS (existing `OrderDialog`/`OrdersPage` tests unchanged).
- [ ] **Step 5: Commit** `S3-16: blanket order types, hooks and dev mocks`

---

### Task 3: Shared schedule editor

**Files:**
- Create: `src/modules/orders/schedule.ts`, `src/modules/orders/schedule.test.ts`, `src/modules/orders/ScheduleEditor.tsx`, `src/modules/orders/ScheduleEditor.test.tsx`

**Interfaces:**
- Produces (`schedule.ts`):
  - `export interface ScheduleRow { item: string; qty: number; date: string }`
  - `export interface ScheduleItem { code: string; description: string; qty: number }` (an ordered line)
  - `export function scheduleSummary(ordered: ScheduleItem[], rows: ScheduleRow[]): { code: string; description: string; ordered: number; scheduled: number; over: boolean }[]` — one entry per distinct ordered code in first-seen order, quantities of duplicate codes summed; rows whose `item` isn't an ordered code are ignored; non-finite qty counts 0; `over = scheduled > ordered`.
  - `export function newScheduleRow(ordered: ScheduleItem[]): ScheduleRow` → `{ item: ordered[0]?.code ?? '', qty: 1, date: '' }`.
- Produces (`ScheduleEditor.tsx`): `export function ScheduleEditor({ ordered, rows, onChange, overHint, emptyMessage }: { ordered: ScheduleItem[]; rows: ScheduleRow[]; onChange: (rows: ScheduleRow[]) => void; overHint: 'above' | 'below'; emptyMessage: string })` — controlled. Table `aria-label="Delivery schedule"`, headers Item · Est. quantity · Expected delivery date · (blank); per row: shadcn `Select` (`aria-label="Delivery item, row N"`, options "{code} — {description}" from distinct `ordered` codes; with none, the only option is disabled "Add an order line first…"), number `Input` (`aria-label="Est. quantity, row N"`, min 1), date `Input type="date"` (`aria-label="Expected delivery date, row N"`), ✕ button (`aria-label="Remove delivery N"`). Footer (`<tfoot>`): `emptyMessage` when `ordered` is empty; else per summary entry "{code} — {description}", "{scheduled} / {ordered} ordered", and "{n} not yet scheduled" (muted) or `Over by {n} — reduce a scheduled quantity ${overHint}` (`text-destructive`/DESIGN.md bad token). **+ Add delivery** button appends `newScheduleRow(ordered)`; disabled when `ordered` is empty.

- [ ] **Step 1: Write failing tests**
  - `schedule.test.ts`: `'sums duplicate ordered lines and scheduled rows per item, in line order'` (ordered `[A×10, B×5, A×5]`, rows `[A 6, B 2, A 4]` → `[{code:'A', ordered:15, scheduled:10, over:false}, {code:'B', ordered:5, scheduled:2, over:false}]`); `'flags an item scheduled past its ordered quantity'` (A×10, rows A 7 + A 4 → `over: true`, scheduled 11); `'ignores rows for items not on the order and blank quantities'` (rows `[{item:'Z', qty:5}, {item:'A', qty:NaN}]` → A scheduled 0); `'newScheduleRow picks the first ordered item'`.
  - `ScheduleEditor.test.tsx`: `'shows remaining per item and the over message with the given hint'` (render with A×10 and a row A 12, `overHint="above"` → text `Over by 2 — reduce a scheduled quantity above`; change qty to 4 via `userEvent` on a stateful wrapper → `6 not yet scheduled`, `4 / 10 ordered`); `'adds and removes deliveries'`; `'with no ordered items shows the empty message and disables Add delivery'`.
- [ ] **Step 2: Run** `npx vitest run src/modules/orders/schedule.test.ts src/modules/orders/ScheduleEditor.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `schedule.ts` and `ScheduleEditor.tsx` as specified.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `S3-16: shared delivery schedule editor`

---

### Task 4: Blanket Orders tab, blanket View, Manage schedule dialog

**Files:**
- Create: `src/modules/orders/BlanketOrdersPage.tsx`, `src/modules/orders/BlanketOrdersPage.test.tsx`, `src/modules/orders/ManageScheduleDialog.tsx`, `src/modules/orders/ManageScheduleDialog.test.tsx`
- Modify: `src/modules/orders/OrdersSection.tsx` (+ its test), `src/modules/orders/OrderDialog.tsx` (+ its test)

**Interfaces:**
- Consumes: `useBlanketOrders`, `useOrder(id, 'blanket')`, `MOCK_BLANKET_ORDERS` (Task 2); `ScheduleEditor`, `scheduleSummary`, `newScheduleRow`, `ScheduleItem`, `ScheduleRow` (Task 3).
- Produces: `OrderDialog({ id, onClose, kind = 'order', onManageSchedule }: { id: string | null; onClose: () => void; kind?: OrderKind; onManageSchedule?: (so: string) => void })`; `ManageScheduleDialog({ so, onClose, onSaved }: { so: string | null; onClose: () => void; onSaved: (so: string) => void })`; route `/orders/blanket`.

- [ ] **Step 1: Write failing tests**
  - `OrdersSection.test.tsx`: tab links in order `['Orders', 'Blanket Orders', 'New Order', 'Drafts']`; `/orders/blanket` renders the Blanket Orders table.
  - `BlanketOrdersPage.test.tsx`: `'lists Blanket Sales Orders with the wireframe columns'` (headers `['Blanket SO #', 'Date', 'PO reference', 'Delivery site', 'Total', 'Status', '']`; row has `BSO-20441`, `Jul 10, 2026`, `PO-8500-B`, `PLANT1`, site name, `₱…` total, `Open`); `'sets the page title'` (`document.title === 'Blanket Orders — Concreat Connect'`); `'empty state'` (answer `orders` with `{ orders: [] }` → `No Blanket Sales Orders yet.`); `'error shows Try again'`; `'+ New Order goes to New Order'` (link `href="/orders/new"`); `'View opens the BSO with Manage schedule and no Trip ID note'`; `'saving a schedule shows the success note'` (Manage schedule → Save schedule → `Delivery schedule for BSO-20441 has been updated.`).
  - `OrderDialog.test.tsx`: `'blanket View: Blanket SO # is —, no Trip ID note, Manage schedule button calls onManageSchedule'`; `'blanket View shows — for a line BC priced at 0'` (answer a blanket `OrderDto` with `unitPrice: 0, lineTotal: 0` → that row shows `—` twice and no `₱0.00`; Order total still BC's `total`).
  - `ManageScheduleDialog.test.tsx`: title `Delivery schedule — BSO-20441`; the caption text exactly as the spec §2.3; opens with one row; `'over quantity shows the error and disables Save schedule'` (qty 2001 → `One or more items exceed the quantity in the Blanket Sales Order. Please adjust the quantity before saving.`, Save disabled, footer `Over by 1 — reduce a scheduled quantity above`); `'Save schedule calls onSaved with the BSO and makes no network call'` (count `serverLogic` calls before/after click: unchanged); `'Cancel closes without onSaved'`; `'a BSO with no lines shows No items on this Blanket Order. and disables Add delivery and Save'` (Review Focus 4).
- [ ] **Step 2: Run** `npx vitest run src/modules/orders` — Expected: new tests FAIL.
- [ ] **Step 3: Implement**
  - `OrdersSection`: add `{ label: 'Blanket Orders', to: '/orders/blanket', end: false }` second; route `blanket` → `BlanketOrdersPage`; update the S3-16 comment.
  - `BlanketOrdersPage`: `usePageTitle('Blanket Orders')`; `PageHeader title="Blanket Orders"` with **+ New Order** as its child (`Button asChild` + `Link` to `/orders/new`); success note (`role="status"`, success tone) from `onSaved`; `SectionCard` + `DataTable` (`label="Blanket Orders"`, `emptyMessage="No Blanket Sales Orders yet."`, loading while pending) with columns Blanket SO # (mono) · Date (`formatDate`) · PO reference (mono, "—") · Delivery site (same cell as `OrdersPage`; extract it to `orderDisplay.tsx` as `SiteCell` if you'd otherwise copy it) · Total (right, `peso`) · Status (`OrderStatusPill`) · actions View + Manage schedule (ghost, sticky right like `OrdersPage`). `QueryError` on error. Holds `viewing` and `scheduling` state; renders `OrderDialog kind="blanket"` with `onManageSchedule` (closes View, opens dialog) and `ManageScheduleDialog`.
  - `OrderDialog`: `kind` → `useOrder(id, kind)`; blanket: description "Blanket sales order details", Blanket SO # "—", no `tripNote`, unit price/line total "—" when `line.unitPrice === 0`, footer adds **Manage schedule** (primary) before Close when `onManageSchedule` given. Remove `console.log(data?.lines)`.
  - `ManageScheduleDialog`: `useOrder(so, 'blanket')`; `ordered = lines.map(({code, description, qty}) => …)`; local `rows` state reset to `[newScheduleRow(ordered)]` each time it opens (decision 3); `ScheduleEditor overHint="above" emptyMessage="No items on this Blanket Order."`; error message + Save disabled when any `scheduleSummary(...).over`; Save disabled with no lines; skeleton while loading, `QueryError` on error; Save → `onSaved(so)` then `onClose()`.
- [ ] **Step 4: Run** `npx vitest run src/modules/orders` — Expected: PASS.
- [ ] **Step 5: Commit** `S3-16: Blanket Orders tab, blanket View and Manage schedule (UI only)`

---

### Task 5: New Order — Blanket mode and blanket drafts

**Files:**
- Modify: `src/modules/orders/new/form.ts` (+ `form.test.ts`), `OrderLinesCard.tsx`, `SummaryCards.tsx`, `NewOrderPage.test.tsx`, `src/modules/orders/drafts/draftPayload.ts` (+ `draftPayload.test.ts`)

**Interfaces:**
- Consumes: `ScheduleEditor`, `ScheduleRow`, `newScheduleRow`, `ScheduleItem` (Task 3).
- Produces (`form.ts`): `NewOrderForm.lines: { code: string; qty: number; price?: number }[]`; `NewOrderForm.schedule: ScheduleRow[]` (default `[]`); `export function validPrice(price: unknown): price is number` (finite, ≥ 0.01); `export function typedSubtotal(lines: NewOrderForm['lines'], items: OrderOptionsDto['items']): number | null` — sum of `qty × price` over chosen lines (item exists, qty > 0), rounded to centavos; `null` when there's no chosen line or any chosen line lacks a `validPrice`; `export const BLANKET_SUBMIT_NOTE = "Blanket Orders can't be submitted from the portal yet. Save as draft to keep this order."`.

- [ ] **Step 1: Write failing tests**
  - `form.test.ts`: `typedSubtotal` sums chosen lines (`[{A,10,2.5},{B,4,100}]` → 425); ignores lines with no item or qty 0; returns `null` for a chosen line with price `undefined`, `0`, `-1` or `NaN` (Review Focus 2); `submitRequest` on a form whose lines carry `price` returns lines with only `code`, `uom`, `qty` (Review Focus 5).
  - `draftPayload.test.ts`: `'restores blanket prices and schedule'`; `'an old draft with no price or schedule opens as before with schedule []'`; `'a malformed schedule (null, object, rows missing fields) becomes []' and a bad orderType becomes single` (Review Focus 1).
  - `NewOrderPage.test.tsx` — replace `'Blanket Order is disabled…'` with:
    - `'Blanket Order: typed unit price drives line total and subtotal; freight stays BC's'` (click radio `Blanket Order`; hint `For orders with agreed pricing, choose Blanket Order.` gone; pick T1_BAG, qty 10, type `200` in `Unit price, line 1` → row shows `₱2,000.00`; `summary('Subtotal')` `₱2,000.00`; `Transport / Freight` equals the quote's freight; Order total = subtotal + freight + other).
    - `'Blanket Order: an empty or zero price shows — in line total, subtotal and order total'`.
    - `'Blanket Order: Submit is disabled with the note'` (`Submit for approval` disabled with a priced quote; `BLANKET_SUBMIT_NOTE` visible; no `orders` POST in `serverLogic` calls).
    - `'Blanket Order shows the Delivery schedule card with one row for the first line item; removing that line clears it from the footer'` (Review Focus 3: footer text `Add order lines above to schedule deliveries against them.` once no line has an item).
    - `'switching back to Single restores BC prices and the hint'` (Review Focus 5).
    - `'Save as draft in Blanket mode saves orderType blanket with prices and schedule'` (inspect the `drafts` POST body: `payload.orderType === 'blanket'`, `form.lines[0].price === 200`, `form.schedule.length === 1`); `'Continue on a blanket draft reopens Blanket mode with prices and schedule'`.
  - Keep every existing Single-mode test passing unchanged.
- [ ] **Step 2: Run** `npx vitest run src/modules/orders/new src/modules/orders/drafts/draftPayload.test.ts` — Expected: new tests FAIL.
- [ ] **Step 3: Implement**
  - `form.ts`: types, defaults (`schedule: []`), `validPrice`, `typedSubtotal`, `BLANKET_SUBMIT_NOTE`; `submitRequest` keeps mapping lines through `quoteRequest` (so `price` never leaves).
  - `draftPayload.ts` `fromDraft`: keep `line.price` when `typeof === 'number'`; `orderType` must be `'single' | 'blanket'` else default; `schedule` = saved array filtered to rows with `typeof item === 'string'`, `typeof qty === 'number'`, `typeof date === 'string'`, else `[]` (the generic loop would otherwise copy `null`).
  - `OrderLinesCard`: toggle bound to `orderType` (`Controller` or `watch` + `setValue`); choosing Blanket with an empty schedule sets `schedule` to `[newScheduleRow(ordered)]`; hint only in Single mode; Blanket mode Unit price cell = `Input type="number" min="0.01" step="0.01"` `aria-label="Unit price, line N"` registered as `lines.N.price` (`valueAsNumber`), Line total = `validPrice(price) && qty > 0 ? peso(round(qty × price)) : '—'`; BC's line `message` hidden in Blanket mode. Below the lines card, in Blanket mode only, a `SectionCard title="Delivery schedule"` with `Controller name="schedule"` → `ScheduleEditor overHint="below" emptyMessage="Add order lines above to schedule deliveries against them."` and `ordered` built from current lines with an item (`{ code, description, qty }` from `options.items`).
  - `SummaryCards`: Blanket mode → Subtotal `typedSubtotal(...)`, Freight/Other from `quote.quote`, Order total = subtotal + freight + otherCharges when both exist, else "—" (skeleton while the quote is pending as today); Submit disabled and `BLANKET_SUBMIT_NOTE` (`text-[12.5px] text-muted-foreground`, under the buttons). Single mode untouched.
- [ ] **Step 4: Run** `npx vitest run src/modules/orders` — Expected: PASS.
- [ ] **Step 5: Commit** `S3-16: New Order Blanket mode (typed prices, delivery schedule, drafts; submit disabled)`

---

### Task 6: Drafts tab Est. total for blanket drafts

**Files:**
- Modify: `src/modules/orders/drafts/DraftsPage.tsx` (`EstTotal`), `DraftsPage.test.tsx`

**Interfaces:**
- Consumes: `typedSubtotal` (Task 5), `quoteQuery`, `quoteRequest`.

- [ ] **Step 1: Write failing tests**: `'a blanket draft's Est. total is its typed prices plus BC's freight and other charges'` (seed `draftsMock` with a blanket draft, line price 200 × 10; answer `order-quote` with freight 50, otherCharges 0 → `₱2,050.00`); `'a blanket draft with a missing price shows —'`.
- [ ] **Step 2: Run** `npx vitest run src/modules/orders/drafts` — Expected: FAIL.
- [ ] **Step 3: Implement**: in `EstTotal`, when `draft.payload.orderType === 'blanket'`, show `typedSubtotal + quote.freight + quote.otherCharges` (or "—" when `typedSubtotal` is null or the quote has no data); Single unchanged.
- [ ] **Step 4: Run** `npx vitest run src/modules/orders/drafts` — Expected: PASS.
- [ ] **Step 5: Commit** `S3-16: blanket draft Est. total`

---

### Task 7: Full verification and plan status

**Files:**
- Modify: `docs/Concreat_Hub_Implementation_Plan.md` (S3-16 row status/notes)

- [ ] **Step 1: Run** `npm test` — Expected: all pass. Then `npm run lint` and `npm run build` — Expected: exit 0.
- [ ] **Step 2: Manual check** with `npm run dev`: Orders → Blanket Orders lists BSO-20441; View → Manage schedule; over-quantity blocks Save; Save shows the note. New Order → Blanket Order: typed prices, schedule card, Submit disabled with the note, Save as draft → Drafts shows "Blanket" with an Est. total → Continue restores it.
- [ ] **Step 3: Update the S3-16 row**: status `🟡 Built (not deployed)`, note "2026-10-27: Blanket Orders tab, View, Manage schedule (UI only, nothing sent), New Order Blanket mode with typed prices + schedule + drafts; Submit disabled until CHP answers Q5 and BC adds writable `unitPrice` on `mcrmSalesOrderLines`. Dev-only until then (spec decision 16)."
- [ ] **Step 4: Commit** `S3-16: plan status`
