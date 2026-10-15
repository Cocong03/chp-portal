# S2 sub-project C, part 1 — Customer Ledger (design)

**Date:** 2026-10-13 · **Status:** Approved in chat (parts 1–3) · **Plan tasks:** S2-07 (BC ask), S2-08 · **Builds on:** sub-project A (list kit, shared BC helpers) and B (`orders`: BC-side filters, merged search, URL filters, pager)

## Goal

The **Customer Ledger** section, built to `docs/Mockup-chp-v2.html` (`#section-ledger`, `LEDGER_ENTRIES`, `renderLedgerEntries`), finished **before BC has a ledger API**: the screen runs locally on the wireframe's sample entries, and a `ledger` endpoint is written against a field list we send the BC team as the S2-07 ask. When BC builds to that list, only the switch below (and, if BC names fields differently, the mapping) changes.

## Decisions (2026-10-13)

| # | Topic | Decision |
|---|---|---|
| 1 | Approach | **Contract first (A):** screen + `ledger` endpoint now, against the requested BC fields below. The list goes to the BC team as the S2-07 request |
| 2 | Dev site until BC delivers | `/ledger` keeps **"This section is coming soon."** on the deployed site. The page is routed only in the local build (`import.meta.env.DEV`), one marked switch in `SectionRoute.tsx`, removed when S2-07 lands. The `ledger` Server Logic is deployed anyway (nothing calls it). **Changed 2026-10-15 (client request):** the deployed site shows the page on the sample entries with a *Sample data* notice; `serverLogic` answers `ledger` from `src/mocks` (`SAMPLE_ONLY`) until S2-07 |
| 3 | Columns | The wireframe's nine. **No running-balance column** (the wireframe has none; plan row S2-08's "Running balance matches BC" is corrected to "Matches the wireframe") |
| 4 | Not now | **CSV / Excel** button (S3-14). Balance tiles are the Dashboard's (separate spec) |
| 5 | Dates | Rows show `Sep 12, 2026`; the wireframe's "(2026)" header note is dropped (same as Orders, decision 5 there) |

## BC facts (probed 2026-10-13, read-only)

- The custom API (`/api/pasi/mcrm/v1.0`) has **no ledger entity**: `chpSalesOrderLines, mcrmBusinessRelation, mcrmCompanies, mcrmContacts, mcrmCustomers, mcrmItems, mcrmSalesOrderLines, mcrmSalesOrders, mcrmSalesPriceLines, mcrmSalesPriceLists, mcrmShipToAddress, mcrmVendorBankAccounts, mcrmVendors`.
- `mcrmCustomers` has `CreditLimit` (for the Dashboard later), no balance fields.
- `contains()` is case-sensitive, and `contains(tolower(field),'…')` is accepted but matches nothing (0 rows for `p0` against `P01`). `or` across different fields → 501 (probed 2026-10-12).

## 1. Server side

### Requested BC API (S2-07): `customerLedgerEntries` (name for BC to confirm)

Standard Cust. Ledger Entry fields, camelCase, every one filterable and sortable:

| Portal | BC field | Notes |
|---|---|---|
| Scope | `customerNo` | the portal always filters on it |
| Sort and identity | `entryNo` | Entry No., unique; one payment can post several entries with the same type, number and date (added after the final review 2026-10-13) |
| Posting date | `postingDate` | |
| Document type | `documentType` | Invoice / Credit Memo / Payment (BC encodes spaces as `_x0020_`, as seen on `mcrmSalesOrders`) |
| Document no. | `documentNo` | Code field (upper case) |
| Ref PO Number | `externalDocumentNo` | Code field (upper case) |
| Description | `description` | Text, mixed case |
| Due date | `dueDate` | `0001-01-01` = none |
| Original amount | `amount` | signed: payments and credit memos negative |
| Remaining amount | `remainingAmount` | signed |
| Status | `open` | boolean |

`$count`, `$top`/`$skip`, `$orderby` and `ge`/`le` on dates must work, as they do on `mcrmSalesOrders`.

### `ledger` Server Logic (GET)

- `.powerpages-site/server-logic/ledger/ledger.js` + `ledger.serverlogic.yml`, web roles **Full Access** (`56b29291-b981-4ef0-865b-41c1e9523a97`) and **Finance & Documents** (`c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3`). Carries the stamped BC helpers (`sessionScope`, `bcGet`, `odataLiteral`, `odataQuery`, `respond`) like every endpoint.
- **Scope:** `sessionScope()` only; any customer/company value in the request is ignored. Filter always starts `customerNo eq '<session customer>'`.
- **Query parameters:** `q` (≤50 chars), `type` (`Invoice` | `Credit Memo` | `Payment`; anything else → empty page, no BC call), `show` (`all`; anything else = open only), `from`/`to` (real calendar dates only, as in `orders`), `page` (1–1000, default 1).
- **Filter:** `customerNo eq …` + `open eq true` (unless `show=all`) + `documentType eq '<type>'` + `postingDate ge/le`. Every value through `odataLiteral`.
- **List (no `q`):** `$orderby=postingDate desc,entryNo desc`, `$top=10`, `$skip`, `$count=true` → total from `@odata.count`.
- **Search (`q`):** parallel queries, each `filter and contains(<field>,'<term>')`, `$orderby` newest first, `$top=200`; merged, de-duplicated (by `entryNo`), sorted newest first, paged in the endpoint:
  - `documentNo` and `externalDocumentNo` with the term in **UPPER CASE**
  - `description` with the term **as typed**, **lower case** and **Capitalised** (first letter upper, rest lower), distinct variants only
  - ponytail: newest 200 per query (same ceiling as `orders`)
- **Rows from BC are re-checked** (`customerNo` equals the session customer) before mapping.
- **Mapping:** `docNo ← documentNo`, `refPo ← externalDocumentNo || null`, `type ← documentType` with `_x0020_` → space, `desc ← description`, `postingDate`, `dueDate` (`0001-01-01` → null), `original ← Number(amount)`, `remaining ← Number(remainingAmount)`, `status ← open ? 'Open' : 'Closed'`. A type the portal doesn't list (e.g. Refund) is passed through under BC's name.
- **Response:** `{ entries, total, page, pageSize: 10 }`. Errors: the shared customer-safe message; BC details only in the log.

### DTOs (`src/api/types.ts`; mirror the wireframe's `LEDGER_ENTRIES`)

```ts
export interface LedgerEntryDto {
  docNo: string
  refPo: string | null
  type: string            // 'Invoice' | 'Credit Memo' | 'Payment', or BC's own name for anything else
  desc: string
  postingDate: string     // YYYY-MM-DD
  dueDate: string | null
  original: number        // signed
  remaining: number       // signed
  status: 'Open' | 'Closed'
}
export interface LedgerPageDto { entries: LedgerEntryDto[]; total: number; page: number; pageSize: number }
```

## 2. Screen — Customer Ledger (`/ledger`)

Built from the Orders kit: `PageHeader`, `SectionCard`, `Toolbar`, `SearchField`, shadcn `Select`, `DatePicker`, `DataTable`, `Pager`, `StatusPill`, `QueryError`. `document.title` = "Customer Ledger — Concreat Connect".

- **Toolbar (wireframe copy):** search *Search document no., Ref PO, or description* (debounced, as Orders) · *All document types* / Invoice / Credit Memo / Payment · *Open items only* (default) / *All entries* · *From* / *To* · *Clear filters* (back to Open items only, page 1).
- **URL:** `q`, `type`, `show=all`, `from`, `to`, `page`; default view has no parameters. Changing a filter resets to page 1.
- **Columns:** Posting date · Document type · Document no. (mono) · Ref PO Number (mono, "—" when none) · Description · Due date ("—" when none) · Original amount · Remaining amount (right-aligned, mono) · Status.
- **Due date** red and bold when `remaining > 0` and `dueDate` < today, **today = the date in Asia/Manila**, whatever the device's zone.
- **Amounts:** negative as `-₱320,000.00` (minus before the peso sign).
- **Status pill:** Open → warning (amber), Closed → success (green).
- **States:** skeleton rows while loading; *No entries match your filters.* when empty (wireframe copy, also with no filters); `QueryError` with Retry on failure; pager "Showing 1–10 of N entries".
- **Local mock** (`src/mocks/`): the wireframe's 9 `LEDGER_ENTRIES`; the dev `serverLogic('ledger')` mock applies the same filters, search, newest-first order and paging.

## 3. Data flow, errors, roles

`LedgerPage` → `useLedger(filters)` (TanStack Query, `keepPreviousData`, `staleTime` 60 s) → `serverLogic('ledger', { query })` → `ledger` Server Logic → BC. Roles: the nav and route already allow Full Access and Finance & Documents (`src/auth/access.ts`); the Server Logic web roles are the security.

## Testing

- **Endpoint** (`test/server-logic/ledger.test.ts`, fake `Server` as in `orders.test.ts`): session scope and request values ignored; default open-only filter; `show=all`; type filter incl. an unknown type → empty page, no BC call; dates (impossible dates dropped); quotes doubled; paging/`$count`; search fan-out (UPPER for codes, as typed / lower / Capitalised for description, duplicates collapsed), merge, de-dup, newest-first, paging; rows for another customer dropped; mapping (negative amounts, `0001-01-01` → null, `_x0020_`, unknown type passed through, `open` → status); BC down → customer-safe error; yml roles. The banned-pattern scan in `bc-helpers.test.ts` covers the new file automatically.
- **Screen** (`src/modules/ledger/*.test.tsx`): columns and wireframe copy; default Open items only; each filter writes the URL and resets the page; Clear filters; due date red/bold only when owed and overdue (fixed clock, Manila date at a day boundary); minus-sign amounts; pills; loading, empty, error/Retry; pager.
- **Route:** the deployed build keeps the placeholder (switch test in `SectionRoute`).

## Docs

- Plan: S2-07 note = the field list above as the ask; S2-08 "Done when" → "Matches the wireframe" (no running balance) and status note.
- Wording checklist: Ledger labels and the empty-state copy.
- A ready-to-send S2-07 message for the BC team.

## Out of scope

CSV / Excel (S3-14) · Dashboard tiles and credit (S2-09/S2-11/S2-12, own spec) · Document Center (S2-15/S2-16, own spec) · Ledger ↔ Dashboard tie-out (S2-13).
