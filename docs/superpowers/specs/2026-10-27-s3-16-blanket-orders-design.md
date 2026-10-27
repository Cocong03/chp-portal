# S3-16 — Blanket Orders (design)

**Date:** 2026-10-27 · **Status:** Agreed in chat, awaiting review of this document · **Plan task:** S3-16 (needs S3-15 for remaining qty, not built here) · **Builds on:** Orders list/View (`OrdersPage`, `OrderDialog`, `useOrders`, `orders` Server Logic GET), New Order (`NewOrderPage`, `OrderLinesCard`, `SummaryCards`, `form.ts`, `useOrderQuote`), Drafts (`chp_orderdraft`, `DraftsPage`)

## Goal

Customers see their **Blanket Sales Orders** from BC on a **Blanket Orders** tab, open one in **View**, and plan deliveries against it in **Manage schedule**. On **New Order** they can switch to **Blanket Order**, type their own agreed unit price per line and build a **Delivery schedule**, and save it as a draft. **Submitting a Blanket Order stays disabled** until CHP answers where a new Blanket Order starts (plan, monday.com open question 5). Built to `docs/Mockup-chp-v2.html`: `#panel-blanket`, `renderBlanketOrders`, `BLANKET_ORDERS`, `setOrderType`, `updatePriceEditability`, `#blanket-schedule-card`, `renderScheduleSummary`, `addScheduleRow`, `#manage-schedule-modal`, `renderManageScheduleSummary`, `saveManageSchedule`, `openView` (Blanket branch).

## Why

Blanket orders are CHP's agreed-price, long-running orders: one BSO with a total quantity, drawn down over weeks by Sales Orders that CHP staff create in BC. Customers currently can't see them in the portal at all. The wireframe gives them their own tab (Rene, 2026-09-14) and lets customers propose new ones at a negotiated price. The read side can ship now; where a new Blanket Order goes is CHP's open decision, so the entry form is built and kept one switch away from live.

## What the BC probe showed (Postman, DEV, 2026-10-27)

| Check | Result |
|---|---|
| Create a Blanket Order through `mcrmSalesOrders` with `"documentType": "Blanket_x0020_Order"` and deep-inserted `mcrmSalesOrderLines` | ✅ 201, **BSO000000011** for C00000002 (a real DEV record) |
| Send a customer price as `unitPrice` on `mcrmSalesOrderLines` | ❌ 400 "The property 'unitPrice' does not exist on type 'Microsoft.NAV.mcrmSalesOrderLine'" |
| BC's own price on the blanket line | `amount` 0, `subtotal` 0: BC doesn't price blanket lines. The header total (₱150) was freight + fuel surcharge only |
| `paymentMethodCode` when not sent | `CREDIT` (the portal would send `CASH`, as for Single Orders) |
| List read: `mcrmSalesOrders?$filter=documentType eq 'Blanket_x0020_Order'` | ✅ 200, `@odata.count` 10 (filterable, so no separate blanket API is needed for the list) |

**BC team ask (raise with this spec):** a writable `unitPrice` on `mcrmSalesOrderLines`, kept as sent for Blanket Orders. Needed before Blanket submit can go live through BC. Also tell BC that BSO000000011 is a test record.

## Decisions

| # | Topic | Decision | Source |
|---|---|---|---|
| 1 | Submit | **Blanket submit disabled.** Nothing is sent to BC or monday.com from New Order in Blanket mode | User, 2026-10-27 (CHP's open question 5) |
| 2 | Unit price | In Blanket mode the customer **types** each line's unit price: a number in ₱, more than 0, 2 decimals (`type="number" min="0.01" step="0.01"`). BC's quote price is not used or shown for Blanket lines | PLANS.md ("free text"), agreed playback (number, since BC needs a number) |
| 3 | Schedule save | **Manage schedule → Save schedule** validates, closes and shows "Delivery schedule for {BSO} has been updated." **Nothing is sent or stored** (not monday.com, not BC, not Dataverse). Reopening starts with one empty row | PLANS.md, agreed playback |
| 4 | Blanket Orders tab | List from BC `mcrmSalesOrders` where `documentType eq 'Blanket_x0020_Order'`, scoped to the session customer. Columns, View and Manage schedule per wireframe | Wireframe, agreed playback |
| 5 | Remaining qty | Not shown and not used. Schedule limits are against the **BSO line quantity** (as the wireframe does), not what's left after drawdowns. Remaining qty waits on S3-15 | S3-15 open with BC |
| 6 | Drawdowns | Not built in the portal. CHP staff create them in BC; they already show on the Orders tab with **Blanket SO #** | Agreed playback |
| 7 | Roles | Full Access and Orders & Delivery: the same two web roles already on the `orders` Server Logic record | Architecture §4/§209 |
| 8 | Drafts | **Save as draft works in Blanket mode** and keeps typed prices and the New Order delivery schedule | Agreed playback |
| 9 | Order summary (Blanket) | Subtotal = sum of qty × typed price (display only). Freight and Other charges come from BC's quote as today. Total = subtotal + freight + other charges | Agreed playback; architecture rule 5 (SPA only sums for display) |
| 10 | Disabled Submit copy | A short note under the disabled Submit in Blanket mode: **"Blanket Orders can't be submitted from the portal yet. Save as draft to keep this order."** The wireframe has no copy for this; flag the gap to CHP with the build | My call (gap flagged) |
| 11 | Endpoint | Blanket reads go through the existing **`orders`** Server Logic with `type=blanket`, not a new `blanket-orders` record. See "Endpoint" | My call — update the architecture doc's `blanket-orders` lines with this spec |
| 12 | Blanket status | Same mapping as Sales Orders (Open → Open, Released → Ready for Dispatch, Pending Prepayment → Pending Prepayment); anything else shows "—" | My call (consistency; no other mapping agreed) |
| 13 | List size | No search, filters or pager (the wireframe has none). Newest first by `orderDate desc, salesOrderNo desc`, capped at 200 rows | Wireframe; my call on the cap (`ponytail:` comment) |
| 14 | Zero prices from BC | BC may return blanket lines with `unitPrice`/amount 0 (BSO000000011 did). In the blanket View, a line whose BC unit price is 0 shows **"—"** for Unit price and Line total, never ₱0.00. Tab **Total** and View **Order total** show BC's `totalAmountInclVAT` as returned, except a total of exactly 0, which shows "—" (final review, 2026-10-27). **First build step:** read a staff-created BSO (e.g. BSO0000000002 for C00000002) and record whether its lines carry prices; if staff BSOs are priced, the rule never triggers | Builder check; my call |
| 16 | Release | **Dev-only until CHP answers question 5.** No feature switch; the wireframe copy stays as is. Before any UAT/production deploy, revisit: Manage schedule says it routes to Customer Service but sends nothing (add a switch or change the copy then) | User, 2026-10-27 ("looks great" to the Dev-only default) |
| 15 | Price basis | The typed unit price is on the **same basis as BC's quoted unit price** on Single Orders (the quote's `lineAmount` = unitPrice × qty, then charges added). Whether that basis includes VAT is still open with BC (`docs/pending from bc.txt` item 8); nothing here changes when they answer | Builder check; my call |

## 1. Server Logic: `orders` GET with `type=blanket` (decision 11)

Changes in `.powerpages-site/server-logic/orders/orders.js` (GET only; POST untouched). The shared helpers region stays untouched and stamped from the template.

- **List** (`type=blanket`, no `id`): one `bcGet` on `mcrmSalesOrders` with `$filter = sellToCustomerNo eq '<session customer>' and documentType eq 'Blanket_x0020_Order'`, `$select = ORDER_FIELDS`, `$orderby = orderDate desc,salesOrderNo desc`, `$top = 200`. No archive merge, no status/site/date/search params (ignored if sent). Rows go through `toSummary` after an ownership check that accepts `Blanket_x0020_Order` (today `owned()` accepts only `Order`; add a variant or a document-type argument, don't loosen the Sales Order path). Answer shape: `{ orders: OrderSummaryDto[] }` (reuse the summary DTO; `bso` and `trip` will be null).
- **Detail** (`type=blanket&id=BSO…`): same as `detail()` but filtering `documentType eq 'Blanket_x0020_Order'`, lines from `chpSalesOrderLines` by `documentNo`, no archive fallback. Another customer's BSO or a missing one → `{ notFound: true }`, as today. Escape `id` with `odataLiteral` (rule 4).
- Without `type=blanket` the endpoint behaves exactly as today. Any other `type` value → treated as absent.
- **Probe first (read-only):** confirm `chpSalesOrderLines?$filter=documentNo eq 'BSO000000011'` returns the blanket's line. If it doesn't, the View dialog shows lines as unavailable and this goes to BC as an ask; don't switch to `mcrmSalesOrderLines` (it returned 400 for reads, plan S2-03).
- Update `orders.serverlogic.yml` `description` to mention Blanket Sales Orders. Web roles unchanged.

### Endpoint (decision 11)

The architecture lists a separate `blanket-orders` GET. Reusing `orders` instead because the blanket reads are the same BC entities, the same scoping, the same summary/line mapping and the same roles; a new record would be another full copy of the shared helpers to keep in step, another site setting and another mock. Update `docs/Concreat_Hub_Architecture.md` (§5 table "Blanket Orders tab / Blanket entry", §209 endpoint list, and §278's "Blanket Sales Orders … New API" row: headers are in `mcrmSalesOrders`; only schedule and remaining qty still need BC work) in the same commit.

## 2. SPA

### 2.1 Blanket Orders tab

- `OrdersSection`: add **Blanket Orders** at `/orders/blanket`, between Orders and New Order (wireframe tab order: Orders · Blanket Orders · New Order · Drafts). `document.title` = `"Blanket Orders — Concreat Connect"`.
- New `src/modules/orders/BlanketOrdersPage.tsx` with `useBlanketOrders()` (in `useOrders.ts`, query key `['blanket-orders']`, `staleTime` 60 s): table columns **Blanket SO #** (mono), **Date**, **PO reference** (mono, "—" if empty), **Delivery site** (code, site name below in faint 12 px, via `siteLabel`/`useSites` as the Orders list does), **Total** (right, ₱), **Status** (`OrderStatusPill`), actions **View** · **Manage schedule** (ghost buttons). **+ New Order** button top-right (links to `/orders/new`). Empty: one row "No Blanket Sales Orders yet." Loading skeleton and `QueryError` with retry like the Orders list. Reuse the Orders list table kit (`DataTable` / existing table components); don't build a new table.
- Success note above the table (wireframe `#blanket-schedule-sync-note`, green, weight 500) after a schedule save: "Delivery schedule for {BSO} has been updated." It stays until the page is left.

### 2.2 View (Blanket)

`OrderDialog` gets a blanket flavour (prop such as `kind: 'order' | 'blanket'`; `useOrder` passes `type=blanket` and uses query key `['order', 'blanket', id]`):
- Same details grid and lines table; **Blanket SO #** shows "—" (it is itself the BSO); **no Trip ID note** (wireframe hides it for Blanket).
- The footer button reads **Manage schedule** (closes View, opens Manage schedule for that BSO) instead of "Reorder these items".
- Remove the stray `console.log(data?.lines)` in `OrderDialog` while there.

### 2.3 Manage schedule dialog

New `ManageScheduleDialog` (shadcn `Dialog`), opened from the row action or from View, with the BSO's detail (reuse the blanket `useOrder` query; skeleton while loading):
- Title **"Delivery schedule — {BSO}"**, caption exactly: "Add or adjust when each item ships against this Blanket Order, any time. Saving, routes the update to our Customer Service team to confirm the scheduling. The total scheduled per item can never exceed what is on this Blanket Order."
- Rows: **Item** (select of the BSO's line items, "{code} — {description}"), **Est. quantity** (number, min 1, default 1), **Expected delivery date** (date input), ✕ remove. **+ Add delivery**. Opens with one empty row (decision 3).
- Footer summary per item (in BSO line order, quantities of duplicate lines summed): "{scheduled} / {ordered} ordered" and either "{n} not yet scheduled" (muted) or "Over by {n} — reduce a scheduled quantity above" (bad colour).
- When any item is over: show "One or more items exceed the quantity in the Blanket Sales Order. Please adjust the quantity before saving." and disable **Save schedule**.
- **Cancel** closes. **Save schedule** closes and raises the tab's success note (decision 3). No network call.

### 2.4 New Order — Blanket mode

- `OrderLinesCard`: enable the **Blanket Order** toggle option (wire `orderType` in the form). Hint under the toggle: Single mode "For orders with agreed pricing, choose Blanket Order."; Blanket mode none (wireframe `setOrderType`).
- `NewOrderForm`: lines become `{ code, qty, price? }` (`price` used only in Blanket mode); add `schedule: { item: string; qty: number; date: string }[]` (default `[]`). Switching to Blanket with an empty schedule adds one empty row (wireframe). Switching back to Single keeps the typed prices and schedule in form state but hides/ignores them.
- **Unit price** column in Blanket mode: an input per line (decision 2), `aria-label="Unit price, line N"`. **Line total** = qty × price when both are valid, else "—". BC's quote message about a line it can't price is not shown in Blanket mode.
- **Delivery schedule card** (`#blanket-schedule-card`), shown only in Blanket mode, under Order lines: same row editor and per-item footer as Manage schedule, but items come from the **current order lines** (lines with an item; "Add an order line first…" as the only option when none), and the footer shows "Add order lines above to schedule deliveries against them." when there are no lines. Over-quantity here shows the "Over by …" text; it doesn't block anything (Submit is already off). Share the row editor and summary between this card and the dialog (one component, items and ordered quantities passed in).
- `SummaryCards` (decision 9): in Blanket mode Subtotal is the typed-price sum; Freight and Other charges keep coming from `useOrderQuote` (the quote still runs on items/qty/source/site); Total = the three summed. "—" for Subtotal/Total until every chosen line has a valid price.
- **Submit disabled** in Blanket mode with the note from decision 10. Single mode unchanged.
- **Save as draft** in Blanket mode saves `orderType: 'blanket'` and the form (prices and schedule included). The draft payload stays `version: 1`; old Single drafts have no `price`/`schedule` and load with the defaults.

### 2.5 Drafts tab

- Type column already shows "Blanket" for blanket drafts.
- **Est. total** for a blanket draft = typed-price subtotal + freight + other charges from the same quote query; "—" if any chosen line has no valid price.
- **Continue** on a blanket draft opens New Order in Blanket mode with prices and schedule restored.

### 2.6 Mocks

Add blanket fixtures from the wireframe's `BLANKET_ORDERS` (BSO with lines; one customer with none for the empty state) to the localhost Server Logic mocks for `orders?type=blanket` list and detail.

## 3. Tests (Vitest + RTL, colocated)

- **Server Logic:** list filters on the session customer and `Blanket_x0020_Order` and ignores customer/company sent by the client; detail of another customer's BSO → `notFound`; a Sales Order id with `type=blanket` → `notFound`; `id` with a quote is escaped; plain `orders` GET still returns only `Order` documents.
- **Blanket Orders tab:** columns and rows from the mock; empty state copy; View opens with Manage schedule button and no Trip ID note; error state with retry.
- **Manage schedule:** over-quantity shows the error and disables Save; Save closes and shows "Delivery schedule for {BSO} has been updated."; reopen starts with one empty row; no network call on save.
- **New Order Blanket mode:** toggle enables price inputs and the schedule card; typed price drives line total and subtotal; freight still from the quote; Submit disabled with the note; Save as draft sends prices and schedule; Single mode unchanged (existing tests updated — the current "Blanket Order is disabled" test changes).
- **Drafts:** blanket draft Est. total uses typed prices; Continue restores Blanket mode.
- Before handoff: `npm test`, `npm run lint`, `npm run build`, plus the existing Playwright order journey still passes.

## Goals / non-goals / anti-goals

- **Goals:** customers see and open their BSOs; can plan a schedule in the UI; can prepare and save a Blanket Order with their agreed prices.
- **Non-goals:** submitting a Blanket Order (BC or monday.com), storing or sending schedules, remaining quantity, portal drawdowns, filters/pager on the Blanket tab.
- **Anti-goals:** anything that reaches BC or monday.com from New Order Blanket mode or Save schedule; showing BC's price (₱0) on blanket lines as if it were the customer's price; copying blanket data into Dataverse (drafts excepted, which are portal data); trusting a customer/company id from the browser.

## Constraints

Architecture rules 1–5 and 8 (BC is the store, no browser→BC, session scoping, OData escaping, SPA only sums for display, server-side security). Customer-facing copy exactly as the wireframe; no BC jargon (`Blanket_x0020_Order`, `documentType` never appear in the UI). shadcn/ui components, DESIGN.md tokens. Server Logic restrictions (no `require`, no banned patterns; shared helpers region stamped from the template, not hand-edited).

## Left to the builder

Component and file split beyond what's named; exact Tailwind classes within DESIGN.md; how the shared schedule editor is factored; mock data details; whether `owned()` takes a document type or a second function exists.

## Follow-ups (not in this build)

1. CHP answers question 5 → either post the BSO to BC (`orders` POST with `documentType` `Blanket_x0020_Order`, `CASH`, typed prices — needs BC's writable `unitPrice`) or route it to the monday.com Blanket Sales Order board. Then turn Submit on.
2. Schedule save → monday.com Blanket Sales Order board (plan D3 mapping), and showing the saved schedule on reopen.
3. Remaining qty per line (S3-15) → schedule limits against remaining instead of ordered.
