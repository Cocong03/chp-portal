# S2 sub-project C, part 2 — Dashboard (design)

**Date:** 2026-10-15 · **Status:** Approved in chat (parts 1–3) · **Plan tasks:** S2-10 (not needed), S2-11, S2-12 · **Builds on:** sub-project B (`orders` status filters), C part 1 (Ledger, contract-first + local-only switch), the live greeting and announcement

## Goal

The Dashboard body built to `docs/Mockup-chp-v2.html` (`#section-dashboard`, `renderDashboard`, `goToOrdersByStatus`): **Account overview** (5 money tiles) and **Sales Orders** (5 status tiles linking to the filtered Orders list), behind one `dashboard` Server Logic. Sales Orders counts are live from BC now; the Account overview is built on sample data and shown only in the local build until BC delivers balances and available credit.

## Decisions (2026-10-15)

| # | Topic | Decision |
|---|---|---|
| 1 | Approach | **A:** one `dashboard` endpoint fanning out BC calls in parallel (Architecture §6). The status filter rules move into the shared stamped helpers so `orders` and `dashboard` use one definition |
| 2 | Account overview on Dev | **Hidden** in the deployed build (`import.meta.env.DEV` switch, as the Ledger), live once BC delivers balance/balance due/overdue and S2-09 available credit. **Changed 2026-10-15 (client request):** shown on the deployed site with the sample figures (`SAMPLE_ACCOUNT`) and a *Sample data* notice until then |
| 3 | Roles | Every role sees every tile (the wireframe doesn't vary the Dashboard by role). Status tiles are **links only for roles that can open Orders** (Full Access, Orders & Delivery); for Finance & Documents and View Only they show the count without "View these orders →" |
| 4 | Invoiced | Count `null` → "—", not a link, until BC delivers the archive change (S2-03) |
| 5 | Counts | BC `$count` with the Orders filters — no counts API, so **S2-10 is not needed** |
| 6 | Balances | Ask BC for the customer card's own **Balance (LCY)**, **Balance Due (LCY)** and an overdue figure, not a sum of ledger entries in the portal (no business math in the SPA; one BC source, so Dashboard and Ledger agree) |
| 7 | Greeting | Stays (restored from the old mockup on 2026-10-13); order: title → greeting → announcement → Account overview → Sales Orders |

## BC facts (DEV, 2026-10-14/15)

- `mcrmSalesOrders`: `documentType`, `status` and `completelyShipped` are filterable; `$count=true` returns `@odata.count`.
- `mcrmCustomers` has `CreditLimit` (PascalCase field names on this entity, filter `Customer_No`); no balance fields.
- No available-credit API yet (S2-09).

## 1. Server side

### Shared status rules (`server-logic-src/bc-helpers.js`)

Move from `orders.js` into the helpers (stamped into every endpoint):

```js
// Portal status → mcrmSalesOrders filter clause (confirmed mapping 2026-09-14; Completely Shipped wins over Status).
var ORDER_STATUS_FILTER = {
    "Open": "status eq 'Open' and completelyShipped eq false",
    "Pending Prepayment": "status eq 'Pending Prepayment' and completelyShipped eq false",
    "Ready for Dispatch": "status eq 'Released' and completelyShipped eq false",
    "Completely Shipped": "completelyShipped eq true"
};
```

`orders.js` uses `ORDER_STATUS_FILTER` instead of its local `STATUS_FILTER`; its tests stay unchanged and green.

### `dashboard` Server Logic (GET)

- `.powerpages-site/server-logic/dashboard/dashboard.js` + `dashboard.serverlogic.yml`, web roles **Full Access** `56b29291-b981-4ef0-865b-41c1e9523a97`, **Orders & Delivery** `11bb7218-55fb-4cae-b8a1-5af2f41237c5`, **Finance & Documents** `c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3`, **View Only** `0c42c9f3-bc20-40a2-8c6a-a731a263ed83`.
- Scope from `sessionScope()` only; request values ignored.
- In parallel (`Promise.all`):
  - one `mcrmSalesOrders` query per status in `ORDER_STATUS_FILTER`: `$filter=sellToCustomerNo eq '<customer>' and documentType eq 'Order' and <clause>`, `$select=salesOrderNo`, `$top=1`, `$count=true` → `Number(@odata.count)`, `null` ("—") if missing (final review 2026-10-15);
  - `mcrmCustomers` `$filter=Customer_No eq '<customer>'`, `$select=Customer_No,CreditLimit`, `$top=1` → `creditLimit` (row re-checked against the session customer; `null` if no row); a failed read logs a warning and gives `null`, so it never takes down the live counts).
- Response:

```ts
export interface DashboardDto {
  counts: { open: number | null; pendingPrepayment: number | null; readyForDispatch: number | null; completelyShipped: number | null; invoiced: number | null }
  account: { balance: number | null; balanceDue: number | null; overdue: number | null; creditLimit: number | null; availableCredit: number | null }
}
```

  `invoiced`, `balance`, `balanceDue`, `overdue`, `availableCredit` are `null` until BC provides them. Errors: the shared customer-safe message.

## 2. Screen — Dashboard (`/`)

Order: `PageHeader` "Dashboard" (no caption) → `Greeting` → `AnnouncementBanner` → **Account overview** (local build only) → **Sales Orders**. Data from `useDashboard()` (TanStack Query, `staleTime: 0`, refetched on every visit).

- **Account overview** — heading "Account overview"; 5 tiles (label · value · caption), wireframe copy:
  - Outstanding Balance · *Total outstanding on your account*
  - Balance Due Today · *Due now per your payment terms*
  - Overdue amount · red (alert) with *Past its due date — please settle to avoid delivery holds* when `overdue > 0`, else green (clear) with *Nothing past due — account in good standing*
  - Credit limit · *Set on your customer record*
  - Available credit · *Kept in sync with your live credit standing*
  - Values via `peso()` (minus before ₱); `null` → "—".
- **Sales Orders** — heading "Sales Orders"; tiles: Open · Pending prepayment (warn) · Ready for dispatch (progress) · Completely shipped (clear) · Invoiced (clear); value = count, `null` → "—".
  - When the role can see Orders (`canSee(roles, 'orders')`) and the count isn't `null`: the tile is a link to `/orders?status=<Portal status>` with caption *View these orders →*.
  - Otherwise a plain tile, no caption.
- **States:** skeleton bar in each tile's value while loading; on error both sections are replaced by `QueryError` with Try again (greeting and announcement unaffected).
- **Layout:** 5 tiles per row on desktop, 2 per row on phones (grid).
- **Local mock:** account = wireframe `LEDGER`/`CREDIT` figures (balance 468,250 · balance due 210,000 · overdue 42,500 · credit limit 750,000 · available 414,250); counts computed from `MOCK_ORDERS` statuses except `invoiced: null`, so tiles agree with the local Orders list.

## Testing

- **Endpoint** (`test/server-logic/dashboard.test.ts`): session scope, request values ignored; one `$count` query per status with exactly `ORDER_STATUS_FILTER`'s clause plus customer and `documentType`; counts mapped; credit limit read and re-checked against the session customer; null fields; BC down → customer-safe error; yml roles.
- **Shared rules:** `orders.test.ts` unchanged and green after the move; a drift test asserts each dashboard count query uses the same clause the `orders` status filter sends.
- **Screen** (`src/modules/dashboard/*.test.tsx`): labels/captions; overdue red vs green; minus-sign amounts; links for Full Access and Orders & Delivery, plain tiles for Finance & Documents and View Only; Invoiced "—" and not a link; loading and error; Account overview hidden in the deployed build (`vi.stubEnv('DEV', false)`).

## Docs

- Plan: S2-10 → not needed (`$count` on `mcrmSalesOrders`); S2-11/S2-12 status notes; S2-07/S2-09 asks updated (customer-card Balance (LCY), Balance Due (LCY), overdue).
- Wording checklist: Dashboard tile labels and captions.
- A ready-to-send BC message for the balance fields and S2-09.

## Out of scope

Ledger ↔ Dashboard tie-out (S2-13, once both are live) · Invoiced count (archive change) · New Order's credit panel (S3-09, will reuse `account.availableCredit`).
