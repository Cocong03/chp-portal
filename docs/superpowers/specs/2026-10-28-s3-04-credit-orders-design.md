# S3-04 / S3-11 — Credit orders and credit approval (design)

**Date:** 2026-10-28 · **Status:** Approved by the user 2026-10-28 · **Plan tasks:** S3-04 (approval path), S3-11 (Pending Approval tab), extends S3-10 (Submit) · **Builds on:** S3-10 `orders` POST, S3-12 drafts (`chp_orderdraft`, `drafts` Server Logic), S2-09 credit overview (`mcrmCustCreditOverviews`), S1-03 flows (`scripts/dataverse/portal_flows.py`)

## Goal

Customers can choose **Credit** as the payment method on New Order. A credit order that fits the customer's live BC credit goes straight to BC, like a cash order. A credit order that **exceeds available credit** or is placed while the account has a **past-due balance** is held in the portal and sent to **CHP's credit team** for approval in **Outlook**. Only an approved order is created in BC. Customers follow held orders, and see the decision and the credit team's comment, on the **Pending Approval** tab.

## Why

CHP moved credit orders from Phase 2 into Release 1 (2026-10-28). Since S3-10, Release 1 has submitted cash orders only, and the wireframe's Credit option, credit warning, "Submit for approval" and Pending Approval tab were left unbuilt.

## Decisions

| # | Topic | Decision | Source |
|---|---|---|---|
| 1 | Release | Credit orders and their approval are **Release 1** (no longer Phase 2) | User, 2026-10-28 (CHP decision) |
| 2 | Who approves | **CHP's credit team**, not the customer and not per company. One Microsoft 365 group for every BC company | User |
| 3 | Approver group | Mail-enabled Microsoft 365 group. Dev: **CHP Credit Team**, `chp-credit-team@automations365.com` (object id `fd0074dd-b5c8-497c-aecf-557321b33baf`), with "Allow external senders" turned on (done 2026-10-28). Its address comes from a new environment variable, so UAT and Prod use CHP's own group | User; group type is my recommendation, accepted |
| 4 | Approval channel | Power Automate **Approvals → Start and wait for an approval**, type **Approve/Reject – First to respond**. Approvers answer from the **Outlook** email; the same approval may also appear in the Teams Approvals app, which is accepted. No custom adaptive card, no Teams-specific work | User |
| 5 | When approval is needed | Only when the order total **exceeds available credit** or the account **has a past-due balance**. Otherwise the credit order is **auto-approved** and created in BC at once | User; wireframe `evaluateCreditCheck` |
| 6 | Before approval | The order **is not created in BC** while it waits. It's a portal record (Dataverse) | User |
| 7 | Approved | The order is created in BC as a Sales Order, then shows under Orders like any other | User |
| 8 | Declined | Nothing reaches BC. The row stays on Pending Approval as **Declined**, **permanently** (it never drops off the list) | User |
| 9 | The decision stays in the portal | Approver, decision, comment and time are stored only in Dataverse. **Nothing about the approval is written to BC** | PLANS.md |
| 10 | No customer email | The customer gets **no email** when the order is approved or declined; they see the outcome in the portal (Orders / Pending Approval) | User, 2026-10-28 (replaces the earlier "email on approve or decline") |
| 11 | Comment shown | The approver's comment also shows on the Pending Approval tab | User |
| 12 | No cancel | Customers can't cancel or edit an order waiting for approval | User |
| 13 | Credit for everyone | **Credit** is offered to **every** customer, whatever their BC credit limit | User |
| 14 | Cash unchanged | Cash orders never need approval and behave as S3-10 built them | Decision 2026-10-26, unchanged |
| 15 | Credit figures | Past due = `overdueAmount > 0`; over credit = re-quoted order total (lines + freight + other charges) `> availableCredit`, both from BC's `mcrmCustCreditOverviews`, read live on the server at submit | BC item #10 (S2-09); architecture rule 5; CHP credit team rules (below) |
| 16 | CHP's rule, verbatim | **Available Credit = Credit Limit (LCY) − Total Exposure**; Total Exposure = Balance + Outstanding Orders + Shipped Not Invoiced + Outstanding Invoices − Invoiced Prepayment Amount (all LCY). **Order total ≤ Available Credit and Overdue Amounts = 0 → auto-released, syncs to BC at once; else held as Pending Credit Approval in the portal until Credit approves it.** The portal uses BC's `availableCredit` as this figure and never recomputes it | CHP credit team, 2026-10-28 (via user) |
| 17 | Held orders and available credit | Orders held in the portal **don't** reduce available credit for the next order: CHP's formula counts only what's in BC. Known effect: a second order can be auto-released while a first one waits, and both together may exceed the limit once the first is approved. The credit team sees the figures at submit in each approval | CHP rule as written (my reading; override if CHP wants held orders counted) |
| 18 | Credit limit 0 | Follows the formula: limit 0 → available credit ≤ 0 → **every** credit order goes to the credit team. No "0 means unlimited" exception | CHP rule as written |
| 19 | BC status | Credit orders, auto-approved or approved, are created **Open** in BC like cash orders; BC staff release them. CHP's "auto-released" means "goes to BC without approval", not BC status Released | User, 2026-10-28 |
| 20 | No expiry | The portal adds **no timeout** of its own: an approval waits until the credit team answers. Power Automate's own limit still applies (a flow run lasts at most 30 days); see section 4 | User, 2026-10-28 |

## Changes to the architecture (record in the same commit)

- **D1 is decided, differently from the architecture's recommendation.** §7 recommended holding pending orders in BC's own approval workflow. Decided instead: the pending order lives in **Dataverse** (`chp_creditapproval`), the approval runs in **Power Automate Approvals**, and BC only ever sees approved orders. Update §5 (Pending Approval tab: source is Dataverse, not BC), §7 (sequence and D1), §8 (the "Pending-approval orders + reason; approval outcome" row) and the decisions table.
- **Rule 1 still holds.** A held order is a customer *request* that doesn't exist in BC, like a draft. Dataverse stores the customer's choices, the reason and an **estimated** total for display. It never stores BC prices per line as a record, credit figures as a record of truth, or anything after BC creates the order (only the SO number, as a link). `chp_payload.lines` (the per-line quote: `unitPrice`, `amount`) is a display copy for the approver, not a record of BC prices; BC prices the order again when it's created.
- **Rule 7 still holds.** The flow is asynchronous back-office work, never on a read path. Submit, Pending Approval and the order list read Dataverse and BC directly.

## 1. Flow of a credit order

```
Customer → Submit (Credit)
  orders POST (Server Logic)
    validate, session scope, re-quote every line (as S3-10)
    read mcrmCustCreditOverviews for the session customer
    ├─ no past due and total ≤ available → create BC Sales Order (credit) → { so }            "auto-approved"
    └─ otherwise → create chp_creditapproval (Awaiting credit approval, reason, payload) → { pending: true }
                      │
                      ▼  Dataverse "row added" trigger
  Flow "Concreat Connect – Credit approval"
    Start and wait for an approval → CHP Credit Team (Outlook; Teams accepted)
    ├─ Approve → status Approved + approver/comment/time → POST BC Sales Order → store SO no
    └─ Reject  → status Declined + approver/comment/time
```

## 2. Dataverse table `chp_creditapproval`

Created in solution `ConcreatHub` in Dev by an idempotent script `scripts/dataverse/creditapproval_schema.py` (the `orderdraft_schema.py` pattern).

| Column | Type | Notes |
|---|---|---|
| `chp_name` (primary) | Text 100 | `"<customer no.> · <PO ref or submitted date>"`, for makers only |
| `chp_contact` | Lookup → Contact, required | Who submitted; shown to the approver |
| `chp_account` | Lookup → Account, required | Session account; scopes the Pending Approval list |
| `chp_status` | Choice, required | `775000000` Awaiting credit approval · `775000001` Approved · `775000002` Declined |
| `chp_reason` | Text 200 | Wireframe wording: `Account has a past due balance`, `Order exceeds available credit`, or both joined with ` · ` (past due first, as `evaluateCreditCheck`) |
| `chp_estimatedtotal` | Currency (or Decimal, see below) | The re-quoted total at submit, for display and for the approver |
| `chp_availablecredit`, `chp_overdueamount` | Decimal | BC's figures at submit, shown to the approver so they decide on what the customer saw. Not a credit record |
| `chp_poref`, `chp_site` | Text | For the Pending Approval table without re-reading BC. `chp_site` = the ship-to code for Delivery, the source plant code for Pick up; the tab shows it with `SiteCell` (code, name underneath once sites load), as the Orders list does |
| `chp_payload` | Multiline text, 100,000 | `{ version: 1, companyId, salesOrder, lines: [{ code, qty, uom, unitPrice, amount }] }`. `salesOrder` is the **exact BC request body** the server built with S3-10's `salesOrder()` (credit payment method); `lines` is the quote for the approval email |
| `chp_salesorderno` | Text 20 | Set by the flow once BC creates the order; doubles as the "already created" guard |
| `chp_approvername`, `chp_approveremail` | Text | From the approval response |
| `chp_comment` | Multiline text 4,000 | Approver's comment |
| `chp_decidedon` | Date and time | When the approval finished |
| `createdon` | System | "Submitted" |

Currency vs Decimal: builder's choice; the other money columns in this solution set the precedent if any exist, else Decimal(2) avoids a transaction-currency lookup.

**Table permission** `Credit-approval-account-(read-create)`: table `chp_creditapproval`, **Account scope** via `chp_account` (the account's colleagues with order roles see each other's held orders, as they see each other's BC orders), privileges **read + create** (+ append/appendto for the lookups), web roles **Full Access** and **Orders & Delivery**. No write or delete for portal users: only the flow changes a row (decision 12).

## 3. Server Logic

### `orders` POST (extends S3-10)

- `readRequest()` accepts `paymentMethod` `'cash'` or `'credit'`; anything else is invalid as today.
- Cash: unchanged.
- Credit:
  1. Same validation, `sessionScope()`, re-quote and `notPriced` check as cash.
  2. Read `mcrmCustCreditOverviews` for `scope.customerNo` (the dashboard's `accountOverview` query). **If BC doesn't answer or has no row, the submit fails** with the usual safe error; the customer tries again. It never auto-approves on missing figures and never sends an approval without figures. *(my call)*
  3. Total = Σ quoted line amounts + freight + other charges, from the same quote S3-10 already reads (never from the browser).
  4. Auto-approved → `bcPost(mcrmSalesOrders, salesOrder(...))` with the credit payment method; answer `{ so, autoApproved: true }`.
  5. Needs approval → `Server.Connector.Dataverse.CreateRecord("chp_creditapprovals", …)` with contact and account from the session (never the request), status Awaiting, reason, figures, payload; answer `{ pending: true }`. Nothing is sent to BC.
- `salesOrder()` takes the payment method. Credit sends **`paymentMethodCode` per section 6**.
- The draft the order came from is removed on success, held or not (as S3-10).

### `orders` GET `?view=pending` (S3-11)

Returns the session account's `chp_creditapproval` rows that are **Awaiting** or **Declined** (all of them; declined rows never drop off, decision 8). Approved rows are not returned: once created, the order shows under Orders. Newest first. Filter values are session GUIDs and fixed option values, never request text.

```ts
/** One row of GET /_api/serverlogics/orders?view=pending. */
export interface PendingOrderDto {
  id: string
  submitted: string // ISO, createdon
  po: string // '' when none
  site: string // chp_site (ship-to code, or plant code for Pick up)
  est: number // chp_estimatedtotal
  status: 'Awaiting credit approval' | 'Approved — being processed' | 'Declined'
  reason: string
  comment: string // '' when none
}
```

Field names follow the wireframe's `PENDING` array (`date` is `submitted` here, matching the ISO convention used elsewhere; builder may align with the existing DTO naming).

### Helpers

Any new shared code goes in `server-logic-src/bc-helpers.js` and is stamped (`node scripts/stamp-server-logic-helpers.mjs`); endpoint-only code stays in `orders.js`.

## 4. Flow "Concreat Connect – Credit approval"

Solution-aware, definition in `scripts/dataverse/credit_approval_flow.json`, deployed by `portal_flows.py` (new `FLOWS` entry). New connection reference **`chp_approvals`** (`shared_approvals`); reuses `chp_dataverse` and `chp_outlook`.

1. **Trigger:** Dataverse *When a row is added* on `chp_creditapproval` (the grant flow's `SubscribeWebhookTrigger` pattern, message Create).
2. **Guard:** read the row (`chp_status`, `chp_salesorderno`); unless it is still *Awaiting credit approval* with no SO number, stop (Succeeded). A resubmitted run never asks the credit team again, and a later Reject never overwrites an Approved row.
3. **Start and wait for an approval**, Approve/Reject – First to respond, assigned to env var **`chp_CreditApprovalGroup`** (new, in `ConcreatHub`; Dev value `chp-credit-team@automations365.com`).
   - **Title:** `Credit approval: <customer name> (<customer no.>) — ₱<est. total>`
   - **Details** (Markdown): company, customer, submitted by (contact name + email), PO ref, shipment method, site or plant, requested/pick-up date, lines table (item, qty, UOM, unit price, amount), estimated total, available credit and overdue at submit, **reason**.
   - **Item link:** none *(my call: approvers have no portal access; BC has nothing to link to yet)*.
   - **Timeout:** none of our own (decision 20). Power Automate ends any flow run after **30 days**; if nobody has answered by then, the run stops, the row stays *Awaiting credit approval*, and the approval email no longer works. The flow does nothing special in that case.
4. **Approved:**
   1. Update row: status Approved, approver name/email, comment, decided on.
   2. If `chp_salesorderno` is already set, stop (a resubmitted run never creates a second order).
   3. Get a BC token and POST `chp_payload.salesOrder` to `companies(<payload.companyId>)/mcrmSalesOrders`, as the activation flow calls BC (HTTP + client credentials from the BC env vars). **Retry policy: none** on this POST.
   4. Store `salesOrderNo` in `chp_salesorderno`. If BC answers 2xx without a `salesOrderNo`, nothing is saved; the flow emails the credit team that BC answered without an order number (*"Check Business Central for this order before creating it."*) and ends **Failed**. If saving the SO number fails, the flow emails the credit team that the order was created in BC as <SO no.> but the portal couldn't record it (*"Do not create it again."*) and ends **Failed**.
   5. **BC fails:** the row stays Approved with no SO number; the flow emails the credit team group (Outlook `SendEmailV2` as the Outlook connection user) *"Approved order for <customer> couldn't be created in Business Central: <error>. Check Business Central for this order before creating it."* (a timeout may still have created it) and ends **Failed** so it shows in run history. *(my call)*
5. **Declined:** update the row (status Declined, approver, comment, decided on).
6. Everything the flow reads about the order comes from the row; nothing comes from the approval response except the decision, approver and comment.
7. **No email to the customer** in any branch (decision 10).

## 5. Screens

**New Order** (`FulfillmentCard`, `SummaryCards`, `form.ts`, `draftPayload.ts`):
- **Credit is enabled.** Choosing it shows **Payment terms** (already built). Default stays **Cash**.
- The over-credit warning already shows for Credit when the quote exceeds available credit (`SummaryCards`). It also shows the past-due line when `overdue > 0`: *(wireframe gap: the wireframe's warning covers only over-credit; my call is to show the same warning style with "⚠ Your account has a past due balance. You may still submit this order for review by our credit team." Flag to the client.)*
- The Submit button keeps the wireframe's label **Submit for approval** for every order (as built). The server decides whether approval is needed (rule 5).
- After submit:
  - `{ so, autoApproved }` → Orders with the wireframe's note *"<SO> was auto-approved — within available credit, no past due balance."* (drop the wireframe's demo tail "Confirmed with no human step.").
  - `{ pending }` → **Pending Approval** tab with the note *"Your order was sent to our credit team for review."* (user's wording).
  - `{ so }` (cash) → unchanged.
- Drafts keep **Credit** (remove the "Credit becomes Cash" overlay in `draftPayload.ts` and its test's expectation for credit; keep the time-window migration).

**Pending Approval tab** (`src/modules/orders/PendingApprovalPage.tsx`, route `/orders/pending`, title *"Pending Approval — Concreat Connect"*), in `OrdersSection`'s tab strip in the wireframe's order:
- Columns (wireframe `#panel-pending`): **Submitted** · **PO reference** · **Delivery site** · **Estimated total** (right, peso) · **Status** (pill: Awaiting credit approval = warn, Approved — being processed = progress, Declined = bad) · **Why it needs review** (reason; when there's a comment, a second muted line *"Credit team: <comment>"* — wireframe gap, decision 11).
- Rows: Awaiting and Declined rows, plus **Approved rows with no SO number** shown as *Approved — being processed* (decided 2026-10-28). An approved order leaves the tab once `chp_salesorderno` is set: the flow sets it on success; when BC creation failed, the credit team asks the portal developer, who records the SO number on the row after the order is created in BC.
- Empty: *"No orders are waiting for approval."* Loading skeleton, `QueryError` with Retry, as the other tabs.
- Roles: the tab and the endpoint follow the Orders roles (Full Access, Orders & Delivery).
- No row actions (decision 12).

## 6. Open with BC (doesn't block building)

- ~~BC must accept the order from a customer who is over limit or past due~~ — confirmed 2026-10-28: BC accepts an approved order for a customer who is over limit or past due. Still test one approval on Dev with a past-due customer.
- ~~`availableCredit` matches CHP's formula~~ — confirmed 2026-10-28: `mcrmCustCreditOverviews` is calculated exactly as CHP's formula and is the source of truth.

- **Credit payment method code:** confirmed 2026-10-28 as **`CREDIT`** (`paymentMethodCode: "CREDIT"`). `CASH` is still unconfirmed.
- **Dates after a slow approval.** The approved order is created with the pick-up/requested date the customer chose. If that date has passed by approval time, BC staff adjust it (no portal logic). Mention to CHP.
- **Prices at approval.** BC prices the order when it's created, i.e. on the approval day; the estimated total is the submit-day quote. Same accepted behaviour as S3-10 (BC may differ from the quote).

## Deployment note (UAT / Prod)

Approvals can only be assigned to users and groups in **the same Microsoft tenant as the Power Platform environment**. UAT and Prod each need a mail-enabled Microsoft 365 credit team group in their environment's tenant, with "Allow external senders to email this group" **and** "Send copies of group conversations and events to group members" on (without the second, the approval email lands only in the group's shared inbox, not each member's Outlook), set in `chp_CreditApprovalGroup`. Approvers need a license that includes Power Automate (Office 365 / Dynamics 365 is enough). The `chp_approvals` connection is re-created per environment, like the other connection references. **Create it with a service account** (e.g. a "Concreat Connect" mailbox account), not a personal one: the approval email shows the connection's owner as "Requested by" with their photo or initials, and a personal connection stops working when that person leaves or changes their password. On Dev it's Michael Tabilin's (2026-10-28), which is fine there.

## Not in scope

Blanket Orders: per CHP's rules they **never** go through credit approval (Cash or Credit), and sync to BC and to monday.com on submit; that's S3-16's submit, still off, not this work. + New Multiple Order (P2-08) is Phase 2. Cancelling or editing a held order. Approvals per BC company. Approver access to the portal. Writing anything about approvals to BC.

## Done when

- A Credit order within credit and with no past due creates a BC order at once and shows the auto-approved note.
- An over-credit or past-due Credit order creates no BC order, appears on Pending Approval with the right reason, and the CHP Credit Team receives an Outlook approval.
- Approve creates exactly one BC order (a resubmitted run doesn't add a second), the row leaves Pending Approval and the order appears under Orders.
- Reject leaves BC untouched, and the row stays on Pending Approval as Declined with the comment.
- No customer email is sent in either case.
- A contact on another account never sees these rows (Account-scope permission and server filter).
- Cash orders behave exactly as before.
- Tests: `orders` POST credit branches (auto-approve, over credit, past due, both, credit read failure) in `test/server-logic`; New Order and Pending Approval UI states with RTL; `draftPayload` keeps Credit.
