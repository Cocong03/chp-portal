# S3 sub-project A — New Order screen (design)

**Date:** 2026-10-21 · **Status:** Approved in chat (sections 1–3) · **Plan tasks:** S3-07, S3-08 (screen only) · **Builds on:** S2-B Orders list (`OrdersPage`, `useSites`), S2-C Dashboard (`SAMPLE_ACCOUNT`), S3-14 Export (`Toolbar` actions)

## Goal

The **New Order** tab of the Orders section, built to `docs/Mockup-chp-v2.html` (`#panel-new`, `addLine`, `setOrderType`, `setShipmentMethod`, `onPayMethodChange`, `syncAutoInstructions`, `recalc`, `computeCharges`, `onDeliverySiteChange`): Order lines, Delivery & fulfillment, Credit standing and Order summary. Real delivery sites from BC; items, prices, plants, payment terms, credit and freight on sample data shaped like the future `order-options` answer, so S3-05 swaps the source without touching the screen. Nothing is submitted or saved yet.

## Decisions (2026-10-21)

| # | Topic | Decision |
|---|---|---|
| 1 | Purpose until BC delivers | **Client demo on a real base:** real BC delivery sites; sample items, prices, plants, payment terms, credit and freight (like the Ledger and Dashboard tiles), no on-screen notice. Save as draft and Submit visible but disabled |
| 2 | Items and plants | **Sample** (wireframe `CATALOG`, PLANT1–3) until S3-01. `mcrmItems` returns 0 rows; BC's standard API has items and `locations`, but which items and plants customers may pick is BC's rule (S3-01), not the portal's guess |
| 3 | Data source | **No new Server Logic now.** `useOrderOptions()` returns a sample `OrderOptionsDto`; S3-05 changes only its `queryFn` to `serverLogic('order-options')` |
| 4 | Credit standing | The **same sample figures as the Dashboard** (`SAMPLE_ACCOUNT`), per the architecture's tie-out rule (one source for Dashboard and New Order credit) |
| 5 | Tabs | Tab strip **Orders** (`/orders`) and **New Order** (`/orders/new`) as links; Blanket Orders, Drafts and Pending Approval appear when built (as agreed in S2-B) |
| 6 | Roles | No extra check: both roles that see Orders (Full Access, Orders & Delivery) may order. Server-side security comes with submit (S3-10) |
| 7 | Starting lines | One empty line (the wireframe's two pre-filled demo lines are left out) |
| 8 | Blanket Order | Toggle shown, **Blanket disabled** until S3-16; no delivery schedule card |
| 9 | Disabled buttons | Save as draft and Submit for approval disabled, tooltip **"Available soon."** |
| 10 | Validation | React Hook Form + `useFieldArray`; HTML-level checks only (qty ≥ 1, email format). Zod rules arrive with Submit (S3-10) |
| 11 | Form persistence | None; leaving the page clears the form (Drafts, S3-12, keeps it) |

## BC facts (DEV, 2026-10-21)

- `mcrmItems`: entity exists, returns **0 rows**. `mcrmSalesPriceLists` / `mcrmSalesPriceLines`: exist, **empty**. Every item's unit price is 0 (standard API).
- Standard API (`/api/v2.0`): `items` (300, 106 blocked; categories CEMENT, ADMIXTURE; e.g. 100016 ISLAND PORTLAND CEMENT TYPE 1 40 KGS, BAG/40) and `locations` (43, internal: silos, coal mills, warehouses, terminals). Not used now (decision 2).
- `mcrmCustomers` (C00000002): `Payment_Method_Code` CREDIT, `Payment_Terms_Code` 31DAYS, `ShipToCode` 65072350, `CreditLimit` 0. Real terms come with S3-05.
- Receiving fields on `mcrmSalesOrders` are mapped in plan row S3-03 (for S3-10); `receivingTime` and `shipmentMethodCode` aren't writable yet.

## 1. Data shape

`src/api/types.ts`:

```ts
/** New Order options (S3-05 `order-options`). Sample until BC delivers items/prices (S3-01), credit (S2-09) and freight (S3-02). */
export interface OrderOptionsDto {
  items: { code: string; description: string; uom: string; unitPrice: number }[]
  plants: { code: string; label: string }[]
  paymentMethod: 'cash' | 'terms'
  paymentTerms: string
  prepaymentTerms: string
  credit: { limit: number; exposure: number; available: number }
  freight: { delivery: number; pickup: number }
  otherCharges: number
}
```

`src/mocks/orderOptions.ts` builds the sample from the wireframe: `CATALOG` (exported from `src/mocks/orders.ts`, so Orders and New Order share one catalog), PLANT1–3 labels, the wireframe `CUSTOMER` terms, freight ₱3,500 / ₱0, other charges ₱0, and `credit` from `SAMPLE_ACCOUNT` (`limit` = `creditLimit`, `available` = `availableCredit`, `exposure` = their difference).

`src/modules/orders/new/useOrderOptions.ts`: `useQuery({ queryKey: ['order-options'], queryFn: async () => ORDER_OPTIONS_SAMPLE, staleTime: 5 * 60_000 })`. Delivery sites come from the existing `useSites()`.

## 2. Routing and tabs

- `App.tsx`: each section route matches its subpaths (`/orders/*`); the Dashboard stays exactly `/`.
- `SectionRoute`'s `orders` page becomes `OrdersSection`: a tab strip (`nav` "Orders sections", links **Orders** → `/orders` and **New Order** → `/orders/new`, `aria-current` on the active one, wireframe tab style) above nested routes: index → `OrdersPage`, `new` → `NewOrderPage`, anything else → `/orders`.
- The top nav's "Orders" stays current on `/orders/new` (NavLink without `end`).
- `OrdersPage`: **+ New Order** (primary, a link to `/orders/new`) in the panel head, per the wireframe. **+ New Multiple Order** waits for S3-13.
- `NewOrderPage` title: "New Order — Concreat Connect".

## 3. The screen

Two columns on desktop (main: Order lines, Delivery & fulfillment; side: Credit standing, Order summary); stacked in that order on a phone. Wireframe labels and copy throughout.

### Order lines (`OrderLinesCard`)

- **Order type** radio group: Single Order (selected) | Blanket Order (disabled). Hint under it: "For orders with agreed pricing, choose Blanket Order."
- Table: **Item** (select "CODE — description", placeholder "Select item…") · **Qty** (number, min 1, step 1, default 1) · **UOM** · **Unit price** (read-only) · **Line total** (qty × price, display only; "—" until an item is chosen) · **✕** (remove line, labelled "Remove line").
- **+ Add line** appends an empty line. The form starts with one empty line.

### Delivery & fulfillment (`FulfillmentCard`)

- **Shipment method** radio group: Pick up (default) | Delivery.
- **Source** select (plants), note "Choose your preferred source plant."
- Pick up only: **Pick up date**.
- Delivery only: **Receiving person** ("Name"), **Receiving contact number** ("e.g. 0917 123 4567"), **Receiving email** (type email, "e.g. logistics@customer.com"), **Requested delivery date**, **Receiving time window** (7:00 – 9:00 AM · 9:00 AM – 12:00 NN · 1:00 – 3:00 PM · 3:00 – 5:00 PM · Other — see instructions below; pending the BC code decision in S3-03).
- Fields hidden by the toggle keep their values (wireframe row 42 behaviour).
- **Loading type** (Loose pile · Palletized · Jumbo Bag; default Loose pile) and **Call before delivery** checkbox.
- **Payment method** (Cash · Terms; default from options). Cash shows **Prepayment terms**, Terms shows **Payment terms**, both read-only.
- **Special delivery instructions** (textarea, 3 rows, wireframe placeholder). Its first line is always `Loading type: <type>. Call before delivery: Yes|No.`, rewritten when either field changes and on blur; the customer's text below it is kept.

`src/modules/orders/new/instructions.ts`: `withAutoLine(text, loadingType, callBefore)` — the wireframe's `syncAutoInstructions` as a pure function: drop an existing auto first line, put the current one first, keep the rest.

### Credit standing and Order summary (`SummaryCards`)

- **Credit standing:** Credit limit · Current exposure · Available credit (bold), note "Exposure = outstanding balance plus orders already placed but not yet invoiced."
- **Order summary:**
  - **Delivery site** select ("CODE — name", real sites; default = the site with `isDefault`, else the first), with "name — address, city" under it. No sites → the select is empty and disabled.
  - **Your PO reference (optional)** ("e.g. PO-8915").
  - Lines (count of lines with an item and qty > 0) · Subtotal · Transport / Freight (`freight.delivery` or `freight.pickup`) · Other charges · **Order total**. Amounts with `peso()`. Display sums only; real totals come from `order-quote` (S3-06).
  - Credit warning, only when Order total > available credit: "⚠ This order exceeds your available credit. You may still submit it for review by our credit team."
  - **Save as draft** and **Submit for approval**, disabled, tooltip "Available soon."
- While options or sites load: skeletons in their places; an options failure shows `QueryError` with Try again.

## 4. Tests (written first)

- `instructions.test.ts`: adds the auto line to empty text; replaces an old auto line; keeps the customer's lines; Yes/No follows the checkbox.
- `NewOrderPage.test.tsx`:
  - choosing an item fills UOM and unit price; qty updates the line total, Subtotal and Order total;
  - + Add line and ✕ change the Lines count;
  - Delivery shows the five receiving fields and hides Pick up date, and the reverse; freight ₱3,500 vs ₱0;
  - the credit warning shows only above available credit;
  - the delivery site defaults to the customer's default and shows its address;
  - Cash shows Prepayment terms, Terms shows Payment terms;
  - loading type and call-before rewrite the instructions' first line;
  - Blanket Order, Save as draft and Submit for approval are disabled;
  - the title is "New Order — Concreat Connect".
- Routing (`OrdersSection` / `AppShell` tests): the tab strip marks the current tab; **+ New Order** opens `/orders/new`; Finance & Documents is redirected from `/orders/new` to the Dashboard.
- Then `npm test`, `npm run lint`, `npm run build`; deploy to Dev; plan rows S3-07/S3-08 updated.

## Out of scope

Blanket Order entry and delivery schedule (S3-16) · Save as draft / Drafts tab (S3-12) · Submit, quote, credit check, Pending Approval (S3-06, S3-10, S3-11) · `order-options` Server Logic (S3-05) · + New Multiple Order (S3-13) · Reorder from the Order view.

## Swap points when BC delivers

| BC delivers | Change |
|---|---|
| S3-01 items + prices, plants; S3-05 | `useOrderOptions` `queryFn` → `serverLogic('order-options')`; delete `ORDER_OPTIONS_SAMPLE` |
| S2-09 available credit | `order-options` (and `dashboard`) return BC credit; Dashboard drops `SAMPLE_ACCOUNT` at the same time |
| S3-02 freight / S3-06 quote | Freight, other charges and totals from `order-quote` instead of the sample rule |
| S3-03 receiving time codes | Time window options from BC's list |
