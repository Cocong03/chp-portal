# S2 sub-project A — Shared list kit, Delivery Sites, Account and User Management, Announcement (design)

**Date:** 2026-10-08 · **Status:** Approved in chat (sections 1–4) · **Source:** `PLANS.md` (S2, mockup `docs/Mockup-chp-v2.html`) · **Plan tasks:** S2-02, S2-14, S2-19

## Goal

Build the first S2 screens to the v2 mockup (layout, labels, copy) on live BC data where the BC APIs already exist, and set up the shared list components that Orders (B), Ledger and Dashboard (C) and Document Center (D) reuse.

S2 is split into four sub-projects, each with its own spec → plan → build: **A** list kit + Sites + Account + Announcement · **B** Orders list + Order view · **C** Ledger + Dashboard · **D** Document Center.

## Decisions (2026-10-08)

| # | Topic | Decision |
|---|---|---|
| 1 | "Portal access" column (Contacts & Portal Access) | **Yes** only when the BC contact has activated (a Dataverse Contact on the session's Account with the same email, case-insensitive), has at least one business web role, **and** BC `customerPortalAccess` = true. Otherwise **No**. A pending access grant (S1-13) still shows **No** until activation applies it |
| 2 | Site request features on the Sites page (Pending Requests card, "Request a new delivery site", "Request a change") | **Left out** until S4-06 builds them. No disabled or placeholder controls |
| 3 | Where the contacts list comes from | The existing **`company`** Server Logic returns the company card **and** the contacts (Architecture §6). No new `contacts` endpoint |
| 4 | Announcement data path | **Power Pages Web API**, Global read (Architecture §5). Adds `src/api/webApi.ts`, which S4 reuses |
| 5 | Tables | One **`DataTable`** in `src/ui/` on TanStack Table and the shadcn `Table` primitives (DESIGN.md §5). No pagination in A; it arrives with Orders (B) |
| 6 | Dashboard greeting | Not built. Mockup v2 removed it (2026-09-29, mockup line 4830). S2-12 is updated to match |

## BC dependencies (sub-project A)

| Need | Status in DEV | What A does meanwhile |
|---|---|---|
| Ship-to default flag (S2-01) | `mcrmShipToAddress` has no default flag | Uses the customer card's **Ship-to Code** if `mcrmCustomers` exposes it (standard BC's default ship-to). If not, every row has `isDefault: false` and the ask stays with BC |
| Website on the customer card (S2-18) | `mcrmCustomers` has no website field (probed 2026-10-04) | Shows "—" |
| Contacts by customer (S2-18) | `MCRMContacts` + `mcrmBusinessRelation` exist | Uses them. If `MCRMContacts` can be filtered by customer no. directly, the relation hop is skipped |
| Q6 Account & User Mgmt visibility per role (Rene) | Pending | Keeps the current assumption: all four business roles see the page, read-only |

## BC DEV facts (probed 2026-10-08, read-only, `scripts/dataverse/bc_probe.py`)

| API | Fields used | Notes |
|---|---|---|
| `mcrmShipToAddress` | `documentNo` (= **customer no.**, misleading name), `code`, `name`, `address`, `address2`, `city`, `postCode`, `contact`, `phoneNo` | camelCase, unlike `mcrmCustomers`. `$filter=documentNo eq '<no>'` works. **No county, no email, no default flag** (`shipmentMethod`, `contact1/2`, `phoneNo1/2` exist but are empty). **C00000009 (BESTRADE) has no ship-tos**; C00000002/06/13/21 have some |
| `mcrmCustomers` | (unchanged) | **No Ship-to Code field** → `isDefault` is always `false` until BC adds a default (S2-01). No website field (S2-18) |
| `mcrmBusinessRelation` | `contactNo`, `vendorNo`, `linktoTable` | `vendorNo eq '<customer>' and linktoTable eq 'Customer'` works (C00000009 → one company contact) |
| `MCRMContacts` | `no`, `companyNo`, `type`, `name`, `phoneNo`, `mobilePhoneNo`, `eMail`, `customerPortalAccess`, `privacyBlocked` | `type eq 'Person'` works. **No job title field** → Title shows "" until BC adds one (S2-18). Phone = `phoneNo`, else `mobilePhoneNo` |

Field names for `mcrmShipToAddress`, the contact title/phone fields and the customer Ship-to Code were confirmed by a **read-only probe** of BC DEV before coding (see Testing). The probe reads the BC client secret into memory only and never prints or stores it; it runs only after the user approves it.

## 1. Server side

### Shared helpers (`server-logic-src/bc-helpers.js`)

- `sessionScope()` also returns `accountId` (the session contact's `parentcustomerid`). Expand `parentcustomerid_account($select=accountid,name,chp_bccustomerno,chp_bccompanyid)`.
- Re-stamp every endpoint with `node scripts/stamp-server-logic-helpers.mjs`; the `--check` drift test covers `me`, `company` and `sites`.

### `sites` (new Server Logic, GET)

- Web roles: **Full Access** (`56b29291-…`) and **Orders & Delivery** (`11bb7218-…`) only.
- `sessionScope()`, then `bcGet(scope, "mcrmShipToAddress", odataQuery({ $filter: "<customer no. field> eq " + odataLiteral(scope.customerNo), $select: …, $top: "500" }))`. Nothing is read from the request.
- Drops any row whose customer no. isn't `scope.customerNo` (defence in depth).
- Default: one extra `mcrmCustomers` read for the Ship-to Code (in parallel with the ship-to read) if the probe finds the field.
- Returns `SiteDto[]` sorted by `code`:

```ts
/** GET /_api/serverlogics/sites. Mirrors the wireframe's SITES[]. */
export interface SiteDto {
  code: string       // Ship-to Address Code
  name: string
  address: string    // street lines joined with ", "
  city: string       // city, county/province (and post code) joined with ", "
  contact: string
  phone: string
  email: string
  isDefault: boolean
}
```

### `company` (extended, GET)

- Web roles unchanged: Full Access, Orders & Delivery, Finance & Documents, View Only.
- Three reads run in parallel (`Promise.all`) after `sessionScope()`:
  1. **BC customer card** (as today).
  2. **BC person contacts** of the customer: `mcrmBusinessRelation` (`vendorNo eq <customer no.>`, `linktoTable eq 'Customer'`) → company contact nos → `MCRMContacts` (`companyNo` in those, `type eq 'Person'`), selecting name, job title, phone, email, `customerPortalAccess`, `privacyBlocked`. Contacts with `privacyBlocked` are skipped.
  3. **Dataverse contacts** on the session's Account: `contacts?$filter=_parentcustomerid_value eq <accountId>&$select=emailaddress1&$expand=powerpagecomponent_mspp_webrole_contact($select=name)`.
- Merge by lowercase email. BC is the list: a Dataverse contact with no BC match isn't shown.
- Returns the existing card fields plus `website` and `contacts`:

```ts
/** GET /_api/serverlogics/company. Mirrors the wireframe's ACCOUNTS[] and PORTAL_CONTACTS[]. */
export interface CompanyDto {
  customerNo: string
  customerName: string
  address: string
  website: string          // "" until BC exposes it
  vatRegNumber: string
  phone: string
  email: string
  contacts: PortalContactDto[]
}

export interface PortalContactDto {
  name: string
  title: string
  phone: string
  email: string
  portalAccess: boolean    // decision 1
  portalRole: string       // highest business role, "" when portalAccess is false
  isYou?: boolean          // email equals the signed-in contact's email
}
```

- Role order for "highest": Full Access › Orders & Delivery › Finance & Documents › View Only.
- All-or-nothing: if any of the three reads fails, the call fails with the shared safe message.

### Permissions

- New table permission **Contact – same account (read)**: table `contact`, **Account** scope through `parentcustomerid`, read only, for the four business roles. Server Logic's Dataverse reads are governed by table permissions (Microsoft Learn, *Interact with Dataverse tables using server logic*).
- If reading coworkers' web roles (`powerpagecomponent_mspp_webrole_contact`) is refused on Dev, add the smallest permission that allows it and record it here.

### Announcement (Dataverse + Web API)

- New table **`chp_announcement`** in `ConcreatHub`: `chp_title` (primary name, text 200), `chp_message` (multiline text 2000), `chp_active` (yes/no, default No). Added to the **Concreat Connect Admin** app (form + view) so ops edit it without a deploy.
- Table permission **Announcement – read (global)**: Global scope, read only, **Authenticated Users**.
- Site settings: `Webapi/chp_announcement/enabled` = `true`, `Webapi/chp_announcement/fields` = `chp_title,chp_message,chp_active`.
- The SPA reads `GET /_api/chp_announcements?$select=chp_title,chp_message&$filter=chp_active eq true&$orderby=modifiedon desc&$top=1`. The newest active row wins; no active row means no banner.

## 2. Screens

### Shared kit (`src/ui/`, DESIGN.md §5–6)

- shadcn components added: `card`, `table`, `badge`, `tooltip`, `alert`.
- **`DataTable`**: TanStack Table + shadcn `Table` in `rounded-xl border bg-card shadow-card overflow-x-auto`; mockup header style (11.5px uppercase faint on `bg-muted`); column meta for numeric/mono cells; `loading` renders skeleton rows; an empty list renders one centred row with the given message.
- **`StatusPill`**: `Badge` variants `good · warn · bad · neutral · progress` with the 6px dot.
- **`SearchField`**: `Input` with a leading Lucide `Search` icon and an `aria-label`.
- **`Toolbar`**: `flex flex-wrap items-center gap-2.5 mb-3.5`, a spacer, and the outline **Clear filters** button.
- **`QueryError`**: the safe error message plus a **Try again** button that calls `refetch`.

### Delivery Sites (`/sites`)

- `PageHeader` "Delivery Sites"; card **Active Delivery Sites**.
- Toolbar: search (placeholder *Search site name, code, or city*), spacer, **Clear filters**.
- Note: *Showing **N** delivery sites.*
- Columns: **Ship-to Address Code** (code in mono, name below in faint 12px) · **Address** (street, line break, city) · **Contact** · **Phone** (mono) · **Default** (green "Default" pill).
- Search is client-side over the full list: code, name or city, case-insensitive.
- Empty: *No delivery sites match your search.* (search active) · *No delivery sites are registered on your account yet.* (no ship-tos; new copy, goes on the wording checklist).

### Account and User Management (`/account`)

- Card **Company Information**: 2-column key/value grid — Customer Number (mono), Company Name, Address, Website ("—" when empty), VAT Registration Number (mono).
- Card **Contacts & Portal Access**, columns: **Name** (+ neutral "You" pill) · **Title** · **Phone** (mono) · **Email** · **Portal access** ("Yes" good / "No" neutral) · **Permissions** (role in a neutral pill; tooltip *Can see: …* listing the section labels `canSee` allows for that role, in nav order; "—" when no access) · **Actions** ("—"; revoke is S4-08).
- Empty contacts: *No contacts are registered on your account yet.* (new copy, wording checklist).

### Dashboard (`/`)

- **Announcement banner** at the top (DESIGN.md: `Alert` with `bg-accent border-l-4 border-l-primary rounded-xl`): eyebrow "Announcement", title, message.
- Hidden when there is no active row or the read fails. The rest of the Dashboard stays the placeholder until sub-project C.

### Wiring

- `src/api/types.ts`: `SiteDto`, `PortalContactDto`, extended `CompanyDto`, `AnnouncementDto { title: string; message: string }`.
- `src/api/webApi.ts`: one GET helper for the Power Pages Web API (same-origin, `Accept: application/json`; no CSRF token needed for GET). On the dev server it answers from `src/mocks` like `serverLogic`.
- Hooks (TanStack Query, `staleTime` 5 minutes): `useSites()`, `useCompany()`, `useAnnouncement()`, each in its module.
- Mock fixtures copy the mockup's `SITES`, `ACCOUNTS[0]`, `PORTAL_CONTACTS` and `ANNOUNCEMENT`.
- `SectionRoute` renders the Dashboard, Sites and Account modules (`React.lazy`); other sections keep `Placeholder`.
- `usePageTitle` on every page ("Delivery Sites — Concreat Connect").

## 3. Loading, errors, empty states

- **Loading:** skeleton rows in tables, skeleton values in Company Information; the banner renders nothing until loaded.
- **Errors:** Sites and Account show `QueryError` in the card. Server Logic already returns only *"We couldn't load this information. Please try again."*; details stay in the log. A blocked contact is handled by the existing QueryClient (re-checks `me`, shows the access-turned-off card). An announcement failure hides the banner and nothing else.
- **Empty:** see each screen above.
- **Caching:** 5-minute `staleTime` for `sites`, `company` and the announcement (Architecture §6 allows minutes for ship-tos; none of this is live-critical).

## Testing

- **Server Logic unit tests** (`test/server-logic/*.test.ts`, fake `Server` as today):
  - `sites`: filters on the session's customer no. with quotes doubled; ignores request query values; maps rows to `SiteDto`; drops another customer's row; sets `isDefault` from the Ship-to Code when available; BC failure → safe error.
  - `company`: decision-1 truth table (activated + role + BC flag → Yes; each one missing → No); highest role; case-insensitive email merge; `isYou`; `privacyBlocked` skipped; Dataverse-only contacts left out; any failed read fails the call; existing card tests still pass.
  - Helper drift: `--check` covers `me`, `company`, `sites`.
- **SPA tests** (Vitest + RTL, colocated, `userEvent`, accessible queries):
  - `DataTable` rows / empty row / loading; `StatusPill` variants.
  - Sites: mockup columns and Default pill; search narrows rows and updates the count; Clear filters; both empty states; error + Try again.
  - Account: company fields with Website "—"; You / Yes / No / role pills and tooltip text; error state.
  - Dashboard: banner shown for an active announcement; hidden for none or a failed read.
- **Live checks on Dev:**
  1. Read-only BC field probe (after user approval).
  2. Confirm `pac auth who`, then `pac pages upload-code-site --rootPath .`.
  3. Dev test users: Full Access and Orders & Delivery see only their own ship-tos; Finance & Documents gets 403 from `sites`; every business role sees the Account page with the correct Yes/No and role per contact.
  4. Ops creates an active announcement in the Admin app → shown on the Dashboard; set inactive → hidden.
- **Before handoff:** `npm test`, `npm run lint`, `npm run build`; update plan rows S2-02, S2-14, S2-19 (and S2-12's greeting note) with status and BC dependencies.

## Out of scope

- Site requests, Pending Requests card and request buttons (S4-06); Revoke access (S4-08).
- Pagination and Excel export (B / S3-14).
- Dashboard tiles and counts (C); Orders (B); Ledger (C); Document Center (D).
- Showing pending access grants on the Contacts list.
