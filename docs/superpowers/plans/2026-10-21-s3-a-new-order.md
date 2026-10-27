# New Order Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The New Order tab of the Orders section (S3-07, S3-08 screen), built to the wireframe, on real BC delivery sites and sample items/prices/plants/terms/credit/freight shaped like the future `order-options` answer.

**Architecture:** No new Server Logic. `useOrderOptions()` calls `serverLogic('order-options')`, which `SAMPLE_ONLY` answers with a sample `OrderOptionsDto` on every build, as the Ledger does (S3-05 removes it from `SAMPLE_ONLY`); sites come from the existing `useSites()`. The Orders section gains a tab strip and nested routes (`/orders`, `/orders/new`); the form is React Hook Form with `useFieldArray`, split into three cards.

**Tech Stack:** React 19, TypeScript, React Router, TanStack Query, React Hook Form, shadcn/ui (Select, Button, Input, Tooltip, Card), Tailwind v4, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-s3-a-new-order-design.md`

## Global Constraints

- Customer-facing copy uses the wireframe's wording exactly (spec §3 lists every label, placeholder and message).
- Page title via `usePageTitle('New Order')` → "New Order — Concreat Connect".
- No business math beyond display sums: line total = qty × unit price, subtotal = Σ line totals, order total = subtotal + freight + other charges. Amounts render with `peso()` from `@/lib/format`.
- Sample numbers: credit limit ₱750,000, available ₱414,250, exposure ₱335,750 (from `SAMPLE_ACCOUNT`); freight Delivery ₱3,500, Pick up ₱0; other charges ₱0; prepayment terms "100% advance payment before dispatch"; payment terms "30 Days from Invoice Date"; default payment method `cash`.
- Plants: PLANT1 "Plant 1 — Main Yard", PLANT2 "Plant 2 — North Depot", PLANT3 "Plant 3 — Warehouse A"; shown as "CODE — label".
- Disabled-button tooltip text: "Available soon."
- Tests: RTL + `userEvent`, accessible queries (no class/test-id queries), colocated with the source. Render through `renderApp` from `@/test/render`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; reference S3-07/S3-08.
- Code style: match neighbouring files (2-space TS, double quotes in `OrdersPage.tsx`, single quotes elsewhere).

## Review Focus

- **Qty cleared or typed as 0 / negative:** the line total shows "—", the line isn't counted, totals never show NaN. → Task 4 test "a blank or zero quantity counts as nothing".
- **Last line removed:** Lines 0, Subtotal ₱0.00, + Add line still works. → Task 4 test "removing every line leaves an empty, working table".
- **Customer with no delivery sites, or sites failing to load:** the Delivery site select is empty and disabled, the rest of the form works. → Task 4 tests "no sites / sites failing → site select disabled, form still works".
- **Switching Pick up → Delivery → Pick up:** values typed in hidden fields survive. → Task 5 test "fields hidden by the toggle keep their values".
- **Customer edits the auto instruction line by hand:** the next loading-type/call-before change or blur restores the auto line and keeps the rest. → Task 2 test "a hand-edited auto line is replaced, the rest kept".

---

### Task 1: Order options shape and sample

**Files:**
- Modify: `src/api/types.ts` (append `OrderOptionsDto`)
- Modify: `src/mocks/orders.ts` (export `CATALOG`)
- Create: `src/mocks/orderOptions.ts`
- Modify: `src/mocks/index.ts` (register `'order-options'`)
- Modify: `src/api/serverLogic.ts` (`SAMPLE_ONLY` gets `'order-options'`)
- Create: `src/modules/orders/new/useOrderOptions.ts`
- Test: `src/mocks/orderOptions.test.ts`

**Interfaces:**
- Produces:
  - `OrderOptionsDto` exactly as in spec §1 (`items`, `plants`, `paymentMethod: 'cash' | 'credit'`, `paymentTerms`, `prepaymentTerms`, `credit: { limit, exposure, available }`, `freight: { delivery, pickup }`, `otherCharges`).
  - `export const CATALOG: Record<string, { desc: string; uom: string; price: number }>` in `src/mocks/orders.ts` (unchanged contents).
  - `export const ORDER_OPTIONS_SAMPLE: OrderOptionsDto` in `src/mocks/orderOptions.ts`.
  - `mocks['order-options'] = () => ORDER_OPTIONS_SAMPLE`; `SAMPLE_ONLY = new Set(['ledger', 'order-options'])` with a comment: remove when S3-05 lands.
  - `export function useOrderOptions()` → `useQuery({ queryKey: ['order-options'], queryFn: () => serverLogic<OrderOptionsDto>('order-options'), staleTime: 5 * 60_000 })`.

- [ ] **Step 1: Write the failing test** `src/mocks/orderOptions.test.ts`

```ts
test('the sample options carry the wireframe catalog and the Dashboard credit figures', () => {
  expect(ORDER_OPTIONS_SAMPLE.items).toContainEqual({ code: 'CEM-T1-40KG', description: 'Portland Cement Type I — 40kg Bag', uom: 'BAG', unitPrice: 245 })
  expect(ORDER_OPTIONS_SAMPLE.items).toHaveLength(Object.keys(CATALOG).length)
  expect(ORDER_OPTIONS_SAMPLE.credit).toEqual({ limit: SAMPLE_ACCOUNT.creditLimit, available: SAMPLE_ACCOUNT.availableCredit, exposure: 335750 })
  expect(ORDER_OPTIONS_SAMPLE.plants.map((p) => `${p.code} — ${p.label}`)).toEqual(['PLANT1 — Plant 1 — Main Yard', 'PLANT2 — Plant 2 — North Depot', 'PLANT3 — Plant 3 — Warehouse A'])
  expect(ORDER_OPTIONS_SAMPLE).toMatchObject({ paymentMethod: 'cash', freight: { delivery: 3500, pickup: 0 }, otherCharges: 0 })
})
```

- [ ] **Step 2: Run** `npx vitest run src/mocks/orderOptions.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the type, the `CATALOG` export, `ORDER_OPTIONS_SAMPLE` (items mapped from `CATALOG`; credit from `SAMPLE_ACCOUNT` with `exposure = creditLimit - availableCredit`; terms and plants from Global Constraints), the mock registration, the `SAMPLE_ONLY` entry and `useOrderOptions`. Add to the test: `expect(await serverLogic('order-options')).toEqual(ORDER_OPTIONS_SAMPLE)`.
- [ ] **Step 4: Run** the same command — Expected: PASS. Run `npx vitest run src/modules/orders` — Expected: PASS (Orders unaffected).
- [ ] **Step 5: Commit** `S3-07: order-options shape and sample (wireframe catalog, Dashboard credit figures)`.

### Task 2: Special-instructions auto line

**Files:**
- Create: `src/modules/orders/new/instructions.ts`
- Test: `src/modules/orders/new/instructions.test.ts`

**Interfaces:**
- Produces: `export function withAutoLine(text: string, loadingType: string, callBefore: boolean): string` — first line becomes `Loading type: <loadingType>. Call before delivery: Yes|No.`; an existing first line matching `/^Loading type: .+\. Call before delivery: (Yes|No)\.$/` (trimmed) is replaced; the rest is kept; with no rest, the result is the auto line alone.

- [ ] **Step 1: Write the failing tests**

```ts
test('adds the auto line to empty text', () => {
  expect(withAutoLine('', 'Loose pile', false)).toBe('Loading type: Loose pile. Call before delivery: No.')
})
test('replaces an old auto line and keeps the customer text', () => {
  expect(withAutoLine('Loading type: Loose pile. Call before delivery: No.\nUse side gate', 'Palletized', true))
    .toBe('Loading type: Palletized. Call before delivery: Yes.\nUse side gate')
})
test('puts the auto line above text that has none', () => {
  expect(withAutoLine('Narrow road', 'Jumbo Bag', false)).toBe('Loading type: Jumbo Bag. Call before delivery: No.\nNarrow road')
})
test('a hand-edited auto line is replaced, the rest kept', () => {
  expect(withAutoLine('Loading type: Anything. Call before delivery: Yes.\nGate 2', 'Loose pile', false))
    .toBe('Loading type: Loose pile. Call before delivery: No.\nGate 2')
})
```

- [ ] **Step 2: Run** `npx vitest run src/modules/orders/new/instructions.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `withAutoLine` (the wireframe's `syncAutoInstructions` as a pure function).
- [ ] **Step 4: Run** the same command — Expected: 4 passed.
- [ ] **Step 5: Commit** `S3-08: special-instructions auto line (loading type, call before delivery)`.

### Task 3: Orders tabs, routes and + New Order

**Files:**
- Modify: `src/App.tsx` (section route path)
- Modify: `src/layout/SectionRoute.tsx` (`orders` → `OrdersSection`)
- Create: `src/modules/orders/OrdersSection.tsx`
- Create: `src/modules/orders/new/NewOrderPage.tsx` (stub: `usePageTitle('New Order')` + `<PageHeader title="New Order" />`; Task 4 fills it)
- Modify: `src/modules/orders/OrdersPage.tsx` (+ New Order link in `PageHeader` children)
- Test: `src/modules/orders/OrdersSection.test.tsx`

**Interfaces:**
- Consumes: `canSee`, `SectionRoute`, `PageHeader`, `Button` (`asChild` with `Link`).
- Produces: `export function OrdersSection()`; `export function NewOrderPage()` in `src/modules/orders/new/NewOrderPage.tsx`; routes `/orders` (list) and `/orders/new`.
- Route rule in `App.tsx`: `path={section.path === '/' ? '/' : `${section.path}/*`}`. `OrdersSection` renders `<nav aria-label="Orders sections">` with `NavLink`s "Orders" (`/orders`, `end`) and "New Order" (`/orders/new`), then `<Routes>`: index → `OrdersPage`, `new` → `NewOrderPage`, `*` → `<Navigate to="/orders" replace />`. Tab look: the wireframe `.tabs` (underline on the current tab), Tailwind tokens as in `AppShell`'s pills.

- [ ] **Step 1: Write the failing tests** (sign in like `AppShell.test.tsx`: `sessionStorage.setItem(MOCK_SESSION_KEY, email)` then `renderApp(<App />, { route })`)

```ts
test('the Orders tabs mark the current one; + New Order opens New Order', async () => {
  const user = userEvent.setup()
  signInAs('full@test.ph', '/orders')
  const tabs = await screen.findByRole('navigation', { name: 'Orders sections' })
  expect(within(tabs).getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'page')
  await user.click(await screen.findByRole('link', { name: '+ New Order' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'New Order' })).toBeInTheDocument()
  expect(within(tabs).getByRole('link', { name: 'New Order' })).toHaveAttribute('aria-current', 'page')
  expect(within(screen.getByRole('navigation', { name: 'Portal sections' })).getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'page')
  expect(document.title).toBe('New Order — Concreat Connect')
})
test('Finance & Documents is sent from /orders/new to the Dashboard', async () => {
  signInAs('finance@test.ph', '/orders/new')
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
})
test('an unknown Orders path lands on the Orders list', async () => {
  signInAs('full@test.ph', '/orders/nope')
  expect(await screen.findByRole('table', { name: 'Orders' }, { timeout: 5000 })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run** `npx vitest run src/modules/orders/OrdersSection.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the route rule, `OrdersSection`, the `NewOrderPage` stub, the `PAGES.orders` swap in `SectionRoute`, and the + New Order link (primary `Button asChild` around `<Link to="/orders/new">+ New Order</Link>`).
- [ ] **Step 4: Run** `npx vitest run src/modules/orders src/layout` — Expected: all pass (existing Orders, AppShell and SectionRoute tests included).
- [ ] **Step 5: Commit** `S3-07: Orders tabs (Orders, New Order), /orders/new route and + New Order`.

### Task 4: New Order form — lines and summary

**Files:**
- Create: `src/modules/orders/new/form.ts`
- Modify: `src/modules/orders/new/NewOrderPage.tsx`
- Create: `src/modules/orders/new/OrderLinesCard.tsx`
- Create: `src/modules/orders/new/SummaryCards.tsx`
- Test: `src/modules/orders/new/NewOrderPage.test.tsx`

**Interfaces:**
- Consumes: `useOrderOptions()` (Task 1), `useSites()`, `OrderOptionsDto`, `SiteDto`, `peso`, `SectionCard`, `QueryError`, `Skeleton`, shadcn `Select`, `Input`, `Button`, `Tooltip`.
- Produces in `form.ts`:
  - `export interface NewOrderForm { orderType: 'single' | 'blanket'; lines: { code: string; qty: number }[]; shipmentMethod: 'pickup' | 'delivery'; source: string; pickupDate: string; receivingPerson: string; receivingContact: string; receivingEmail: string; requestedDate: string; timeWindow: string; loadingType: string; callBefore: boolean; paymentMethod: 'cash' | 'credit'; instructions: string; site: string; poRef: string }`
  - `export const LOADING_TYPES = ['Loose pile', 'Palletized', 'Jumbo Bag']`, `export const TIME_WINDOWS = ['7:00 – 9:00 AM', '9:00 AM – 12:00 NN', '1:00 – 3:00 PM', '3:00 – 5:00 PM', 'Other — see instructions below']`
  - `export function newOrderDefaults(options: OrderOptionsDto, sites: SiteDto[]): NewOrderForm` — one empty line `{ code: '', qty: 1 }`, `single`, `pickup`, first plant, Loose pile, call-before false, `paymentMethod` from options, `instructions = withAutoLine('', 'Loose pile', false)`, site = the `isDefault` site's code else the first site's else `''`, `timeWindow` = first window, other strings `''`.
- `NewOrderPage` waits for options (skeleton while pending; `QueryError` with Try again on error), then mounts the form with `useForm({ defaultValues: newOrderDefaults(...) })` inside `FormProvider`; sites loading/failing never blocks the form (they're passed as `[]`, and the site default is set when they arrive if still empty). Layout: `grid gap-5 lg:grid-cols-[1fr_340px]`, main column `OrderLinesCard` (+ Task 5's `FulfillmentCard` slot), side column `SummaryCards`.
- `OrderLinesCard({ options })` and `SummaryCards({ options, sites })` read the form via `useFormContext<NewOrderForm>()`. Line total and summary values derive from `useWatch` — no extra state. The Item select per line has `aria-label="Item, line N"`, Qty `aria-label="Quantity, line N"`, remove button `aria-label="Remove line N"`.
- Summary rows are `<dl>`-free plain rows; each figure must be findable by its label (put label and value in one element per row so `getByText('Subtotal').parentElement` holds the value, as in the Dashboard tests).
- Save as draft / Submit for approval: `disabled` Buttons each wrapped in `<span tabIndex={0}>` as the `TooltipTrigger` (disabled buttons swallow hover), tooltip "Available soon."

- [ ] **Step 1: Write the failing tests** (`renderApp(<NewOrderPage />, { route: '/orders/new' })`; a helper `pick(user, comboboxName, optionName)` clicks the Select trigger then the option)

```ts
test('choosing an item fills UOM and unit price; qty drives the line total and the summary', async () => {
  // pick 'CEM-T1-40KG — Portland Cement Type I — 40kg Bag' on line 1, set qty 10
  // row shows 'BAG', '₱245.00', '₱2,450.00'; Lines 1; Subtotal ₱2,450.00; Transport / Freight ₱0.00; Other charges ₱0.00; Order total ₱2,450.00
})
test('+ Add line and ✕ change the Lines count', async () => {
  // two lines with items → Lines 2; remove line 1 → Lines 1
})
test('a blank or zero quantity counts as nothing', async () => {
  // item chosen, qty cleared → line total '—', Lines 0, Subtotal ₱0.00; qty '0' → same; no 'NaN' anywhere
})
test('removing every line leaves an empty, working table', async () => {
  // remove line 1 → Lines 0, Subtotal ₱0.00; + Add line → an 'Item, line 1' combobox exists again
})
test('the credit warning shows only when the order total exceeds available credit', async () => {
  // CEM-T1-40KG × 10 → no warning; CEM-T2-BULK × 100 (₱485,000) → '⚠ This order exceeds your available credit. You may still submit it for review by our credit team.'
})
test('credit standing shows the Dashboard figures', async () => {
  // Credit limit ₱750,000.00 · Current exposure ₱335,750.00 · Available credit ₱414,250.00 and the exposure note
})
test('the delivery site defaults to the customer default and shows its address', async () => {
  // combobox 'Delivery site' shows 'PLANT1 — Plant 1 — Main Yard'; text 'Plant 1 — Main Yard — Km 19 Marcos Highway, Brgy. San Roque, Antipolo City, Rizal'
})
test.each([['no sites', []], ['sites failing', new ApiError(500, 'x')]])('%s → site select disabled, form still works', async (_case, answer) => {
  // answer 'sites' with `answer` (mock serverLogic by name like OrdersPage.test.tsx) → 'Delivery site' combobox disabled; choosing an item still updates Subtotal
})
test('Blanket Order, Save as draft and Submit for approval are disabled', async () => {
  // radio 'Blanket Order' disabled, radio 'Single Order' checked; buttons disabled; hovering the Submit wrapper shows 'Available soon.'
})
test('a failed options load shows Try again', async () => {
  // answer 'order-options' with new ApiError(500, 'x') → alert "We couldn't load this information. Please try again." and a 'Try again' button; restoring the real answer and clicking it shows 'Order lines'
})
test('the page title is set', async () => {
  // document.title === 'New Order — Concreat Connect'
})
```

Fill each test body with the assertions in its comment (exact strings as written).

- [ ] **Step 2: Run** `npx vitest run src/modules/orders/new/NewOrderPage.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `form.ts`, the page, `OrderLinesCard` (order-type radiogroup with the hint "For orders with agreed pricing, choose Blanket Order.", lines table, + Add line) and `SummaryCards` (Credit standing; Order summary with Delivery site + address line, "Your PO reference (optional)" with placeholder "e.g. PO-8915", Lines/Subtotal/Transport / Freight/Other charges/Order total, warning, disabled buttons). Freight = `options.freight[shipmentMethod === 'delivery' ? 'delivery' : 'pickup']`. A line counts when it has an item and `qty > 0` (`Number(qty)` finite).
- [ ] **Step 4: Run** the same command — Expected: all pass. Then `npx vitest run src/modules/orders` — Expected: PASS.
- [ ] **Step 5: Commit** `S3-07: New Order lines, credit standing and order summary (sample prices and credit; Save/Submit disabled)`.

### Task 5: Delivery & fulfillment card

**Files:**
- Create: `src/modules/orders/new/FulfillmentCard.tsx`
- Modify: `src/modules/orders/new/NewOrderPage.tsx` (render it after `OrderLinesCard`)
- Test: `src/modules/orders/new/NewOrderPage.test.tsx` (append)

**Interfaces:**
- Consumes: `NewOrderForm`, `LOADING_TYPES`, `TIME_WINDOWS` (Task 4), `withAutoLine` (Task 2), `OrderOptionsDto`.
- Produces: `export function FulfillmentCard({ options }: { options: OrderOptionsDto })`.
- Hidden fields stay registered (render-hidden with the `hidden` attribute, as the wireframe does), so values survive toggling.
- `instructions` is rewritten with `withAutoLine(current, loadingType, callBefore)` when loading type or call-before changes and on the textarea's blur.
- Labels exactly: "Shipment method" (radiogroup: Pick up, Delivery), "Source" + note "Choose your preferred source plant.", "Pick up date", "Receiving person" ("Name"), "Receiving contact number" ("e.g. 0917 123 4567"), "Receiving email" (type email, "e.g. logistics@customer.com"), "Requested delivery date", "Receiving time window", "Loading type", "Call before delivery", "Payment method" (Cash, Terms), "Prepayment terms", "Payment terms", "Special delivery instructions" (placeholder "Add anything else after the line above — e.g. narrow access road, use side gate, contact guard on arrival").

- [ ] **Step 1: Write the failing tests**

```ts
test('Delivery shows the receiving fields and hides Pick up date; freight follows', async () => {
  // default: 'Pick up date' visible, 'Receiving person' not; Transport / Freight ₱0.00
  // click radio 'Delivery' → Receiving person, Receiving contact number, Receiving email, Requested delivery date, Receiving time window visible; 'Pick up date' hidden; Transport / Freight ₱3,500.00
})
test('fields hidden by the toggle keep their values', async () => {
  // Delivery → type 'Juan Dela Cruz' in Receiving person → Pick up → Delivery → still 'Juan Dela Cruz'
})
test('Cash shows Prepayment terms, Terms shows Payment terms', async () => {
  // default Cash → textbox 'Prepayment terms' has '100% advance payment before dispatch', read-only; pick 'Terms' → 'Payment terms' has '30 Days from Invoice Date'
})
test('loading type and call before delivery rewrite the first instructions line', async () => {
  // textarea starts 'Loading type: Loose pile. Call before delivery: No.'; type '\nGate 2' at the end; pick 'Palletized'; tick 'Call before delivery'
  // → 'Loading type: Palletized. Call before delivery: Yes.\nGate 2'
})
test('Source lists the plants with the wireframe note', async () => {
  // combobox 'Source' shows 'PLANT1 — Plant 1 — Main Yard'; text 'Choose your preferred source plant.'
})
```

- [ ] **Step 2: Run** `npx vitest run src/modules/orders/new/NewOrderPage.test.tsx` — Expected: the 5 new tests FAIL.
- [ ] **Step 3: Implement** `FulfillmentCard` and mount it.
- [ ] **Step 4: Run** the same command — Expected: all pass.
- [ ] **Step 5: Commit** `S3-08: Delivery & fulfillment card (pick up / delivery fields, loading type, call before, payment terms, instructions line)`.

### Task 6: Verify, record and deploy

**Files:**
- Modify: `docs/Concreat_Hub_Implementation_Plan.md` (rows S3-07, S3-08)

- [ ] **Step 1: Run** `npm test`, `npm run lint`, `npm run build` — Expected: all pass, no lint errors; the build lists a `NewOrderPage`-containing Orders chunk and no growth of the main `index` chunk beyond a few kB.
- [ ] **Step 2: Update plan rows** — S3-07 and S3-08 → `🟡 Deployed to Dev (sample data)`, notes: "2026-10-21: New Order tab (`/orders/new`) per spec `2026-10-21-s3-a-new-order-design.md`; real delivery sites, sample items/prices/plants/terms/credit/freight via `useOrderOptions` (swap in S3-05); Blanket, Save as draft and Submit disabled until S3-16/S3-12/S3-10."
- [ ] **Step 3: Commit** `S3-07/S3-08: plan rows`.
- [ ] **Step 4: Deploy** `npm run deploy` — Expected: "Target confirmed: https://org380257ac.crm5.dynamics.com/" and "Upload complete".
