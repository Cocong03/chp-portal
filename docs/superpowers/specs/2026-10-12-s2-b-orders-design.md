# S2 sub-project B — Orders list and Order view (design)

**Date:** 2026-10-12 · **Status:** Approved in chat (sections 1–4) · **Plan tasks:** S2-04, S2-05, S2-06 · **Builds on:** sub-project A (`2026-10-08-s2-a-sites-account-announcement-design.md`): list kit, `sites`, shared BC helpers

## Goal

The **Orders** tab of the Orders section, built to `docs/Mockup-chp-v2.html`: a server-filtered, paged list of the customer's Sales Orders and an Order view dialog with lines and the Trip ID note, on live BC data where BC has it, with the rest ready for when BC adds it.

## Decisions (2026-10-12)

| # | Topic | Decision |
|---|---|---|
| 1 | Status (BC has no status field) | Build it now: the endpoint returns `status: null` → Status column shows "—" and the **status dropdown is hidden** while no returned order has a status. Pills, filter and the five statuses are built and tested on mocks. When BC adds the field, one mapping change in the endpoint lights it up |
| 2 | Blanket Sales Orders and other documents in `mcrmSalesOrders` | **Include only the `SOR` number series** (`startswith(salesOrderNo,'SOR')`, one constant). BC rejects `not` filters, and the API also returns `BSO…` (blanket), `SCM…` and `SIN…` documents with no document type. Replace with `documentType eq 'Order'` once BC adds it; BC confirms the `SOR` series per environment |
| 3 | Approach | One `orders` Server Logic: list filtered and paged **in BC**; search merges two queries; detail by SO number with an ownership check. Filters live in the URL |
| 4 | Out of scope until S3 | Blanket Orders / New Order / Drafts / Pending Approval tabs (no tab strip), **+ New Order**, **+ New Multiple Order**, **CSV / Excel** (S3-14), **Reorder** (needs New Order). Order view has **Close** only |
| 5 | Dates | Rows show `Oct 9, 2026`. The mockup puts the year in the header because its samples share one year (its own comment says a real build should revisit this); real history spans years |

## BC DEV facts (probed 2026-10-12, read-only, `scripts/dataverse/bc_probe_orders.py`)

| Need | BC field | State |
|---|---|---|
| Sales Order # | `mcrmSalesOrders.salesOrderNo` (`SOR0000000006`) | ✅ (`documentNo` is empty) |
| Customer filter | `sellToCustomerNo` | ✅ C00000002 has 8 `SOR` orders (18 records incl. `BSO`/`SCM`/`SIN`) |
| Order date | `orderDate` | ✅ |
| PO reference | `externalDocumentNo` | ✅ (some filled: `PO1`, `PO2`) |
| Delivery site | `shiptoCode` | ✅ matches Delivery Sites codes |
| Total | `totalAmountInclVAT` (+ `totalAmountExclVAT`, `vatAmount`) | ✅ |
| Status | — | ❌ missing (S2-03) |
| Pick up / Delivery | `shipmentMethodCode` | ⚠️ always empty; codes unknown |
| Trip ID (+ assigned date) | `tripEntryNo` | ⚠️ always empty; no assigned date |
| Expected delivery | `requestDeliveryDate` | ⚠️ always `0001-01-01` (empty); `shipmentDate` set on 5/19 — BC to confirm the field |
| Blanket SO # | — | ❌ missing |
| Archived (shipped / invoiced) orders | — | ❌ no endpoint |
| Lines | `chpSalesOrderLines` by `documentNo` = SO number: `itemNo`, `description`, `quantity`, `unitOfMeasureCode`, `unitPrice`, `amount`, `AmountIncludingVAT`, `type` (`Item` / `G/L Account`) | ✅ (`mcrmSalesOrderLines` returns 400) |
| OData | `$count`, `$top`, `$skip`, `$orderby`, `startswith`, `contains`, date `ge/le`, `eq` | ✅ |
| OData limits | `or` across **different** fields → 501; `not` → 501; `contains` is **case-sensitive** (`tolower` ignored) | ❌ |
| Also new | `itemPriceQuotes` entity (likely the D2 price-calculation endpoint, for S3) | — |

**BC asks (added to S2-03):** `documentType` on `mcrmSalesOrders` (or confirm the `SOR` series per environment) · status (the five portal statuses, or BC status + completely-shipped/invoiced flags) · archived orders · `shipmentMethodCode` values for Pick up / Delivery · Trip ID + assigned date · the expected-delivery field · Blanket SO # · whether `unitPrice` includes VAT.

## 1. Server side

### `orders` Server Logic (GET)

- Web roles: **Full Access** (`56b29291-…`), **Orders & Delivery** (`11bb7218-…`). Customer from `sessionScope()` only; any customer/company value in the request is ignored. Shared helpers stamped as usual.
- Query parameters (validated before BC):
  - `q`: trimmed, max 50 characters, `odataLiteral`-escaped.
  - `site`: `odataLiteral`-escaped.
  - `from`, `to`: used only if they match `^\d{4}-\d{2}-\d{2}$` (dates are unquoted in OData); otherwise ignored.
  - `page`: integer ≥ 1 (default 1).
  - `status`: accepted, ignored until BC has the field.
  - `id`: switches to detail mode.
- **List** (no `id`):
  - Base filter: `sellToCustomerNo eq <session> and startswith(salesOrderNo,'SOR')` + `shiptoCode eq <site>` + `orderDate ge <from>` / `orderDate le <to>`.
  - Without `q`: one BC call with `$orderby=orderDate desc,salesOrderNo desc`, `$top=10`, `$skip=(page-1)*10`, `$count=true`.
  - With `q`: parallel calls (each base filter + `$top=200`): `contains(salesOrderNo,<Q upper>)`, `contains(externalDocumentNo,<q as typed>)` and, if different, `contains(externalDocumentNo,<q upper>)`. Merge, de-duplicate by `salesOrderNo`, sort `orderDate desc, salesOrderNo desc`, slice the page in the endpoint; `total` = unique matches.
  - Returns `{ orders: OrderSummaryDto[], total: number, page: number, pageSize: 10 }`.
- **Detail** (`id`):
  - `id` must start with `SOR`; otherwise not-found without calling BC for lines.
  - `mcrmSalesOrders?$filter=salesOrderNo eq <id> and sellToCustomerNo eq <session>`; no row → **not found** (same answer as a missing order, so another customer's order is never confirmed).
  - Then `chpSalesOrderLines?$filter=documentNo eq <id>`.
  - Not found is returned as `{ notFound: true }` (Server Logic can't set a 404 status; the SPA maps it).
  - Returns `OrderDto`.

### DTOs (`src/api/types.ts`; mirror the mockup's `ORDERS`)

```ts
export type OrderStatus = 'Open' | 'Pending Prepayment' | 'Ready for Dispatch' | 'Completely Shipped' | 'Invoiced'

export interface OrderSummaryDto {
  so: string
  date: string                 // orderDate, YYYY-MM-DD
  po: string                   // externalDocumentNo, "" when none
  site: string                 // shiptoCode, "" when none
  ship: 'Pickup' | 'Delivery' | null   // null until BC fills shipmentMethodCode (codes to confirm)
  bso: string | null           // null until BC adds it
  trip: { id: string; assignedAt: string | null } | null   // null while tripEntryNo is empty
  edd: string | null           // requestDeliveryDate; null for empty / 0001-01-01
  total: number                // totalAmountInclVAT from BC
  status: OrderStatus | null   // null until BC adds it
}

export interface OrderLineDto {
  code: string                 // itemNo
  description: string
  qty: number
  uom: string
  unitPrice: number
  lineTotal: number            // AmountIncludingVAT from BC (never computed in the SPA)
}

export interface OrderDto extends OrderSummaryDto {
  lines: OrderLineDto[]
}

export interface OrdersPageDto {
  orders: OrderSummaryDto[]
  total: number
  page: number
  pageSize: number
}
```

## 2. Screens

### Orders (`/orders`)

- `PageHeader` "Orders". No tab strip until S3 builds the other tabs.
- **Toolbar** (mockup order):
  - Search (*Search SO number or PO reference*, label "Search orders").
  - **Status** `Select` (*All statuses*, Open, Pending Prepayment, Ready for Dispatch, Completely Shipped, Invoiced): hidden while every returned order has `status: null`.
  - **Delivery site** `Select` (*All delivery sites*, then `CODE — name` from `useSites()`).
  - **From** / **To** date pickers (shadcn Popover + Calendar, DESIGN.md §5; dates sent as `YYYY-MM-DD`).
  - **Clear filters**.
- Search is debounced (~300 ms). Every filter change resets to page 1.
- **Table** (`DataTable`):
  - **Sales Order #** (mono)
  - **Order date**
  - **PO reference** (mono)
  - **Delivery site**: code (mono), site name below in faint 12px
  - **Ship**: 22px P/D circle with Pick up / Delivery tooltip, or "—"
  - **Blanket SO #**
  - **Trip ID**
  - **Expected delivery**
  - **Total** (₱, right-aligned, mono)
  - **Status**: `StatusPill` (Open neutral · Pending Prepayment warn · Ready for Dispatch progress · Completely Shipped / Invoiced good) or "—"
  - **View** (ghost button)

  "—" for any empty value.
- **Pager** (new `src/ui/Pager.tsx`): *Showing 1–10 of N orders* (singular *order* for 1) with outline **← Prev** / **Next →**, disabled at the ends. Previous rows stay while the next page loads.
- **Empty states:**
  - *No orders match your filters.* (mockup, any filter set)
  - *You don't have any orders yet.* (no filters; new copy → wording checklist)

### Order view (shadcn `Dialog`)

- Title: the SO number.
- Key/value grid: Order date · Status · PO reference · Shipment method (Pick up / Delivery / "—") · Delivery site (`CODE — name`) · Expected delivery date · Blanket SO # · Trip ID number.
- Lines table: Item (`code — description`) · Qty · UOM · Unit price · Line total, then an **Order total** row = `total` from BC.
- Trip ID note (mockup copy):
  - Trip assigned → good tone: *Trip ID **X** assigned on DATE.* (+ *This is your basis for entry at the plant gate.* for Pick up; "on DATE" only when `assignedAt` is known).
  - No trip + Pick up → warn tone: *No Trip ID number yet — this order can't be picked up at the plant until one is assigned.*
  - No trip + Delivery → warn tone: *No Trip ID number yet — assigned once this delivery is scheduled.*
  - Shipment method unknown → no note.
- Buttons: **Close** only.
- States: skeleton while loading; `QueryError` with Try again; *We couldn't find this order.* for not-found (new copy → wording checklist).

### Shared helpers

`src/lib/format.ts`: `peso(n)` → `₱1,234.00`, negatives `-₱1,234.00` (DESIGN.md); `formatDate(iso)` → `Oct 9, 2026`, `—` for empty or `0001-01-01`. Reused by Ledger and Documents.

## 3. Data flow, errors, roles

- **URL state:** `/orders?q=&status=&site=&from=&to=&page=` via `useSearchParams` (Back works; Dashboard tiles in C link to `/orders?status=Open`).
- **`useOrders(filters)`:** TanStack Query keyed by the filters, `placeholderData: keepPreviousData`, `staleTime` 1 minute.
- **`useOrder(id)`:** enabled only while the dialog is open, `staleTime` 0.
- **Site names** from `useSites()` (cached). If it fails, codes still show without names.
- **Errors:**
  - List failure → `QueryError` in the card (toolbar stays usable).
  - Detail `{ notFound: true }` → *We couldn't find this order.*; other failures → `QueryError`.
  - Blocked → existing QueryClient handling (re-checks `me`, access-turned-off card).
  - Server Logic logs the failing BC step with secrets stripped (shared `respond`).
- **Roles:** endpoint web roles are the security (Full Access, Orders & Delivery). The nav already hides Orders for other roles. The page is lazy-loaded inside `PageErrorBoundary`.

## Testing

- **Server Logic** (`test/server-logic/orders.test.ts`, fake `Server`):
  - Base filter + `SOR` prefix + order + `$top/$skip/$count`.
  - Site and date filters with quotes doubled.
  - Malformed dates dropped (e.g. `2026-10-01') or 1 eq 1`).
  - Request customer/company values ignored.
  - Search: parallel queries, merge/de-dup/sort/page, `total` = unique matches.
  - Mapping to DTOs (BC totals; `null` ship/trip/edd/bso/status).
  - Detail with lines and BC line amounts.
  - Another customer's SO and non-`SOR` ids → `{ notFound: true }` with no lines read.
  - BC failure → safe error; blocked → `{ blocked: true }`.
  - Helper drift check covers `orders.js`.
- **SPA** (Vitest + RTL, colocated):
  - `format.ts`.
  - `Pager` text and disabled ends.
  - Orders page:
    - Columns, "—" placeholders, ₱ totals.
    - Status dropdown hidden when all statuses are null, shown with pills when mocks have statuses.
    - Site options `CODE — name`.
    - Debounced search updates the URL and resets the page.
    - Next/Prev; Clear filters empties the URL.
    - Both empty states; error + Try again; `/orders?site=X` pre-selects the site.
  - Order view:
    - Details and lines with BC Order total.
    - Each Trip ID note variant (mocks).
    - Not-found message; load error.
- **Live checks on Dev** (`michael+c2@…`, C00000002):
  - Only `SOR…` rows (never `BSO`/`SCM`/`SIN`).
  - Paging, site and date filters.
  - Search `PO1` / `0006`.
  - View lines and totals match BC.
  - Another customer's `id` → not-found.
  - Finance & Documents user → 403 from `orders`.
- **Before handoff:** `npm test`, `npm run lint`, `npm run build`; update plan rows S2-03..06, wording checklist, BC asks.

## Out of scope

- The other Orders tabs, New Order, New Multiple Order, Excel export, Reorder (S3).
- Blanket Orders (S3-15).
- Dashboard order-count tiles (C).
- Status mapping beyond `null` until BC delivers the field.
