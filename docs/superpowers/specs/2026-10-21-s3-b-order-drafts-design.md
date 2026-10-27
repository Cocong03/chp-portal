# S3 sub-project B — Order drafts (design)

**Date:** 2026-10-21 · **Status:** Agreed in chat, awaiting review of this document · **Plan task:** S3-12 · **Builds on:** S3-A New Order (`NewOrderPage`, `NewOrderForm`, `useOrderOptions`, `OrdersSection`), shared Server Logic helpers (`server-logic-src/bc-helpers.js`)

## Goal

Customers can save a New Order form as a draft and come back to it later: **Save as draft** on New Order, and a **Drafts** tab that lists the signed-in user's drafts with **Continue** and **Delete**. Built to `docs/Mockup-chp-v2.html` (`#panel-drafts`, `saveDraft`, `loadDraft`, `renderDrafts`, `#delete-draft-modal`). Drafts are portal data in Dataverse: they never reach BC and are never credit-checked.

## Why

Customers often can't finish an order in one sitting (a PO number or a quantity still to confirm). Without drafts, leaving the page loses the form (S3-A decision 11). Drafts are also the first portal-owned table the SPA writes, so this sets the pattern for Requests, Complaints and site requests.

## Decisions

| # | Topic | Decision | Source |
|---|---|---|---|
| 1 | Lifetime | A draft stays until the customer deletes it (or submits it, once S3-10 exists). **No automatic clean-up, no age warning** | User, 2026-10-21 |
| 2 | Who sees a draft | **Only the contact who saved it**, not colleagues on the same account | Plan S3-12, architecture §9 |
| 3 | Never BC | Saving, listing and deleting drafts never call BC's order APIs or the credit check | Wireframe comment, plan S3-12 |
| 4 | Naming | First save creates **"Draft #N"**; saving again while continuing a draft **updates that draft** | Wireframe `saveDraft` |
| 5 | Prices | A draft stores the customer's **choices only** (item codes, quantities, fields), never prices, freight or credit. Continue and the Drafts tab's **Est. total** use the **current** `order-options` | User (agreed playback), wireframe Reorder note |
| 6 | Stale choices | An item, delivery site or plant saved in a draft that no longer exists comes back **empty**, for the customer to pick again | User (agreed playback) |
| 7 | After submit | When Submit arrives (S3-10), submitting a continued draft deletes it. **Not built here**; S3-10 owns it | User (agreed playback) |
| 8 | Data path | **Server Logic `drafts`** (Dataverse connector) instead of the Portal Web API the architecture names. See "Data path" | My call — architecture doc updated with this spec |
| 9 | Roles | Full Access and Orders & Delivery (the roles that see Orders), on the Server Logic record **and** the table permission | Architecture §4 |
| 10 | Blanket | Blanket Order is disabled until S3-16, so drafts are Single only for now; the payload carries `orderType` so S3-16 can add Blanket drafts without a migration | S3-A decision 8 |

## Data path (decision 8)

The architecture (§2 line 12, §5 "Drafts tab", §9) says the SPA reads and writes portal tables through the Portal Web API. For drafts this spec uses a **Server Logic endpoint** instead, still behind a Contact-scope table permission:

- **The server sets the owner.** `chp_contact` and `chp_account` come from `Server.User` → contact → account (rule 3's pattern). With the Web API the browser would send the contact binding itself.
- **One caller, one pattern.** The SPA's only data caller is `serverLogic()` (`src/api/serverLogic.ts`), with mocks on localhost and the blocked-access answer. No `webApi.ts` exists yet; adding a second caller, Web API site settings and a second mock path for one table is more surface than one Server Logic record.
- **Same access check.** The endpoint uses `sessionScope()`, so a contact whose portal access BC has turned off gets `{"blocked":true}` like every other page.
- **Table permissions still apply.** Microsoft Learn ("Interact with Dataverse tables using server logic") requires table permissions for `Server.Connector.Dataverse`; Contact scope stays the second line of defence.

The architecture doc's three Drafts lines are updated in the same commit as this spec. Requests, Complaints and site requests decide their own path when they're designed.

## 1. Dataverse table `chp_orderdraft`

Created in solution `ConcreatHub` in Dev by an idempotent script `scripts/dataverse/orderdraft_schema.py` (the `announcement_schema.py` pattern: `ensure_table`, `ensure_attribute`, lookups as in `identity_schema.py`, then `PublishXml`).

| Column | Type | Notes |
|---|---|---|
| `chp_name` (primary) | Text 100, required | "Draft #N" |
| `chp_contact` | Lookup → Contact, required | Owner; set by the server from the session |
| `chp_account` | Lookup → Account, required | The account the draft was saved under (Phase 2 switcher: drafts list per active account) |
| `chp_payload` | Multiline text, 100,000 | JSON of the form choices (section 2) |
| `modifiedon` | System | "Last saved" |

Ownership: organization-owned is not required; the default user/team-owned table is fine, since portal access goes through table permissions.

**Table permission** `.powerpages-site/table-permissions/Order-draft-own-(CRUD).tablepermission.yml`: table `chp_orderdraft`, **Contact scope** (`756150001`) via the `chp_contact` relationship, read/create/write/delete, append/appendto as the platform needs for the lookups, web roles Full Access (`56b29291-…`) and Orders & Delivery (`11bb7218-…`).

## 2. Payload

```ts
/** chp_payload: the New Order form's choices. No prices, freight or credit (decision 5). */
export interface DraftPayload {
  version: 1
  orderType: 'single' | 'blanket'
  form: NewOrderForm // lines (code, qty), site, poRef, shipment method, receiving fields, dates, window, loading, callBefore, paymentMethod, instructions, source
}
```

- `NewOrderForm` (`src/modules/orders/new/form.ts`) already holds only choices; it is stored as-is.
- **Loading a draft** starts from `newOrderDefaults(options, sites)` and overlays the saved values. Saved item codes not in `options.items`, a site not in `sites`, or a source not in `options.plants` become `''` (decision 6). Unknown keys are ignored.
- `version` lets a later shape change read old drafts.

## 3. Server Logic `drafts`

`.powerpages-site/server-logic/drafts/drafts.js` + `drafts.serverlogic.yml` (roles: Full Access, Orders & Delivery). Shared helpers stamped from `server-logic-src/bc-helpers.js` (`node scripts/stamp-server-logic-helpers.mjs`), never hand-edited. Every method starts with `sessionScope()` and wraps its work in `respond()`.

| Method | Request | Does | Answer |
|---|---|---|---|
| `GET` | — | Drafts where `_chp_contact_value` = session contact **and** `_chp_account_value` = session account, newest `modifiedon` first | `DraftDto[]` |
| `GET` | `?id=` | One draft, only if it belongs to the session contact (else not found: the existing `{ notFound: true }` answer, used for every "else 404" below) | `DraftDto` |
| `POST` | `{ payload }` | Creates "Draft #N" (N = highest number among this contact's draft names + 1, so numbers aren't reused after a delete), contact and account from the session | `DraftDto` |
| `PUT` | `?id=` + `{ payload }` | Replaces the payload of the session contact's own draft (else 404) | `DraftDto` |
| `DELETE` | `?id=` | Deletes the session contact's own draft (else 404) | `{ deleted: true }` |

```ts
/** One row of GET /_api/serverlogics/drafts. */
export interface DraftDto {
  id: string
  label: string // "Draft #3"
  savedAt: string // ISO, modifiedon
  payload: DraftPayload
}
```

Server-side checks (the browser is never trusted):
- Ownership: read the record and compare `_chp_contact_value` with the session contact before PUT/DELETE/GET by id. Contact-scope permission backs this up.
- `id` must be a GUID; anything else is 404.
- `payload` must be a JSON object, at most 100,000 characters once stringified, with `version` 1; otherwise 400 "This draft couldn't be saved." The server doesn't interpret the form fields.
- The server ignores any `contact`, `account` or `label` in the request body.
- Values placed in a Dataverse `$filter` are GUIDs from the session, never request text.

## 4. Screens

**Tabs** (`OrdersSection`): **Orders · New Order · Drafts** (the wireframe's order, Blanket Orders and Pending Approval still to come). Drafts → `/orders/drafts`. The Drafts tab shows a count badge when there's at least one draft (wireframe `#drafts-badge`), from the same `['drafts']` query.

**Drafts tab** (`src/modules/orders/drafts/DraftsPage.tsx`, title "Drafts — Concreat Connect"):
- Panel head: **+ New Order** (primary, link to `/orders/new`), per the wireframe.
- Table columns: **Draft** (label + tag "Single"/"Blanket"), **Last saved** (date, existing date formatter), **Delivery site** (the site's label from `useSites()`, `—` if none or no longer found), **Est. total** (right-aligned peso), and **Continue** / **Delete** (ghost buttons, Delete in the "bad" colour).
- **Est. total** = Σ qty × current unit price of each line whose item still exists + current freight for the shipment method (`options.freight`) + `options.otherCharges`, display only (rule 5). `—` while options load.
- Empty: *No saved drafts. Start a new order and choose "Save as draft" to come back to it later.*
- Loading: skeleton rows; error: the shared `QueryError` with Retry.
- **Delete** opens a shadcn Dialog: title **"Delete this draft?"**, text **"This cannot be undone, are you sure you want to proceed?"**, buttons **Cancel** and **Delete draft** (destructive). Confirming deletes, closes the dialog and refreshes the list; a failure shows a Sonner error toast and keeps the row.

**Continue** goes to `/orders/new?draft=<id>`. The URL carries the draft so a refresh keeps it.

**New Order with a draft** (`NewOrderPage`):
- With `?draft=`, it loads the draft (`['drafts', id]` query) along with the options and sites, then fills the form (section 2). While loading: the existing skeleton. Draft not found (deleted elsewhere): the form opens empty and a note says *"This draft is no longer available."*
- *(my call)* With a draft, the form **waits for the sites list** too (unlike a new order, which opens without it). If sites fail to load, the saved site code is **kept** as-is rather than treated as stale, so a later save never erases a valid site; the stale check (decision 6) runs only against a loaded list. The "pick the default site once sites arrive" effect applies to new orders only, never to a continued draft, so a cleared or empty site stays empty.
- The note above the form reads *"Continuing Draft #2, saved Oct 21, 2026."* (wireframe `loadDraft`).
- **Save as draft** is enabled (Submit stays disabled until S3-10). Without a draft it POSTs, then replaces the URL with `?draft=<new id>` so later saves update it; with a draft it PUTs. While saving the button is disabled and reads "Saving…". Success: the note reads *"Saved as draft. You may go to the Drafts tab to edit, or delete."* and the `['drafts']` list is invalidated. Failure: Sonner error toast, the form stays as typed. *(my call)* If the continued draft was deleted meanwhile (PUT answers not found), the save **creates a new draft** instead, switches the URL to it and shows the usual saved note, so nothing typed is lost.
- Before saving, the instructions' auto line is synced (`withAutoLine`), as the wireframe's `collectFormState` does.
- No validation is required to save a draft: an empty or half-filled form saves.

## 5. Mocks and local dev

`src/mocks/drafts.ts` keeps an in-memory list (starts with one sample draft so the tab isn't empty on localhost) and answers GET/POST/PUT/DELETE like section 3, registered as `drafts` in `src/mocks/index.ts`. `drafts` is **not** in `SAMPLE_ONLY`: the deployed site uses the real Server Logic.

## 6. Testing

Vitest + RTL, colocated:
- `DraftsPage.test.tsx`: lists drafts newest first with label, tag, date, site label, Est. total from current prices; empty state copy; error + Retry; Delete → dialog → Cancel keeps it, Delete draft removes it; failed delete shows the toast and keeps the row; badge count on the tab.
- `NewOrderPage.test.tsx` additions: Save as draft creates a draft and updates the URL; a second save updates (one draft, not two); Continue fills every field; stale item/site/plant come back empty; sites failing keeps the saved site; a draft with no site isn't given the default; missing draft shows the note; saving a draft deleted meanwhile creates a new one; failed save keeps the form and shows the toast; Submit still disabled.
- `draftPayload.test.ts`: `fromDraft(payload, options, sites)` overlay and stale-choice rules; `estTotal(payload, options)`.
- Server Logic: `node scripts/stamp-server-logic-helpers.mjs --check`; banned-pattern scan as for the other records. Live check on Dev after deploy: save, continue, update, delete as a test user; a second test user on the same account sees none of the first user's drafts.

## Non-goals

- Blanket Order drafts (S3-16), deleting a draft on submit (S3-10), sharing drafts with colleagues, automatic clean-up, an unsaved-changes prompt when leaving New Order, Reorder.

## Left to the builder

File split inside `src/modules/orders/drafts/`, query keys beyond `['drafts']` / `['drafts', id]`, the skeleton's look, and the exact Dataverse lookup relationship names (follow `identity_schema.py`).
