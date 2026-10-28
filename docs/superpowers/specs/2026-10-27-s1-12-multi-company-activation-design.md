# S1-12 — Multi-company activation (APO Cement) (Design)

**Date:** 2026-10-27 · **Plan task:** S1-12 (enable APO Cement) · touches S1-03 (activation flow), S1-13 (access grants)
**Environment:** Dev only. Power Platform *CHP Customer Portal* (`org380257ac`); BC environment **`DEV`**, which already holds both companies: **Solid Cement Corporation** `d2e4496e-be79-f111-8070-6045bd2058e3` and **APO Cement Corporation** (ID supplied by the user at build time; never guess it).

## BC DEV facts (probed 2026-10-27, read-only)

| Fact | Detail |
|---|---|
| APO company ID | `6b92847e-637e-f111-8071-6045bd2051b9` (from the user) |
| App access | The portal's app reads every entity the portal uses in APO (`mcrmCustomers`, `MCRMContacts`, `mcrmBusinessRelation`, `mcrmShipToAddress`, `mcrmSalesOrders`, archives, ledger, credit overview, `mcrmPortalItems`, `mcrmSourcePlants`, `chpSalesOrderLines`) → 200. `portalPriceQuotes` and order POST aren't probed (writes); live acceptance covers them |
| Order codes | APO's Receiving Time codes are the same as Solid Cement's (`24H`/`DAY`/`EARLY`/`NIGHT`, user's screenshot). Both companies have Payment Method `CASH`. **No per-company code columns needed; `orders.js` unchanged** |
| APO activation test | `michael+c2-apo@automations365.com` → APO **C00000002** only |
| Q10 cross-company test | `michael+c2@automations365.com` → Solid **C00000002** and APO **C00000002**: the same customer no. in both companies, so it also proves the pair counting |

## Intent

APO Cement customers activate and use Concreat Connect exactly like Solid Cement customers do today: **the same portal, scoped to APO's data**. CHP will add more BC companies later, so adding a company must be a data change (one row per environment), not a code or flow change.

## What already works (no change)

- Every Server Logic endpoint reads the company from the signed-in contact's Account (`chp_bccompanyid`), never from config or the request (`server-logic-src/bc-helpers.js`). An Account that holds APO's ID gets APO data everywhere.
- The topbar "Viewing …" label and the dashboard greeting show `chp_bccompanyname` from the Account.
- Account's alternate key is already (`chp_bccustomerno`, `chp_bccompanyid`).
- The "linked to another customer" check compares Account IDs, so it's already company-safe.

## Goals

1. An email that resolves to exactly one BC customer in **any** listed company activates, and the Account is created with that company's ID and name.
2. **One email, one customer, across all companies.** If the email resolves to more than one customer — in one company or across companies — activation is blocked (`needs_help`) and ops are emailed, as today. Reason: there is no account switcher until Phase 2.
3. Access grants say which company they're for. Customer numbers **do repeat** across companies (APO's run from `C00000001` just like Solid Cement's), so a grant matched on customer no. alone could hit the wrong company.
4. Adding company #3 later = add a row to the companies table in each environment. No flow, code or solution change.

## Non-goals

- Account switcher / several linked accounts per contact (Phase 2).
- Any screen change. No company picker on the Activate page.
- Per-company differences in the portal (catalog, plants, rules). If BC data differs per company, the existing APIs already return it per company.

## Anti-goals (failure even if it "works")

- An APO contact seeing any Solid Cement data, or vice versa.
- A grant applying a role to a contact of the same customer no. in the **other** company.
- An email on customers in two companies getting an invitation for one of them.

## Decisions

| Topic | Decision | Who |
|---|---|---|
| Same portal for APO | Yes, scoped to APO's data, **including ordering** | User |
| Email on customers in several companies | Block (Q10 extended across companies) | User |
| Grants carry a company | Yes | User |
| Where the company list lives | **Dataverse table "BC Companies"**, not one environment variable per company | User |
| Retire `chp_BCSolidCementCompanyId` | The flows stop reading it. Delete it from `ConcreatHub` once the new activation is verified on Dev, and drop it from CLAUDE.md / env_vars.py. Also update the other scripts that read it (`seed_dev_test_users.py`, `bc_probe*.py`) and the env-var list in the activation flow test | My call |
| Editing an Applied grant to another company/customer | If the grant was **Applied** and no longer matches the contact's Account (customer no. + company), the grant flow **removes the contact's business roles** (same as Revoked) and sets Customer mismatch. Today the mismatch branch only sets the status, which would leave a role on the wrong company's contact | My call (closes anti-goal 2 via edits) |
| Active user later added to a customer in another company | No change. Existing logins keep working on their own Account; Q10 is enforced at activation only. A later activation request for that email returns `needs_help` (ops see it). Phase 2's switcher handles real multi-company users | My call |
| BC call fails for one company during activation | Fail closed: the run fails and the page shows the existing error. Never activate on a partial company search | My call |

This bends the project rule "all environment-specific values are environment variables": company IDs become per-environment **rows**. Record the change in the architecture doc (§ config table at line ~334 and line ~157/337) and in CLAUDE.md.

## 1. BC Companies table (`chp_bccompany`)

New table in `ConcreatHub`, organization-owned, created by an idempotent script in the style of `scripts/dataverse/identity_schema.py`.

| Column | Type | Notes |
|---|---|---|
| `chp_name` (primary) | Text 100, required | Display name written to Account `chp_bccompanyname`, e.g. "Solid Cement", "APO Cement" (matches the existing short form and the architecture doc) |
| `chp_bccompanyguid` | Text 36, required, display "BC Company ID" | BC company GUID for **this** environment. (Not `chp_bccompanyid`: Dataverse already names the table's own row id that) |

- Alternate key on `chp_bccompanyguid`.
- "Active" = standard `statecode` (Active/Inactive). Activation only searches active rows, so a company can be added in advance and switched on later.
- Seed rows in Dev: Solid Cement (`d2e4496e-…`) and APO Cement (ID from the user). The seed script takes the IDs as values, never hardcoded APO guesses. UAT/Prod get their rows when those environments exist (add to S1-14's checklist).
- **Portal access:** none. The SPA and Server Logic never read this table (they read the Account). No table permissions, no Web API site settings.
- **Admin app:** add the table to *Concreat Connect Admin* read-only for the *Concreat Connect Admin* role (`prvRead` + `prvAppendTo`, needed for the grant lookup). Creating/editing company rows is for system administrators (developers) only.

## 2. Activation flow (`scripts/dataverse/activation_flow.json`)

Replace the single-company lookup with a loop over active company rows.

1. **List companies:** Dataverse List rows `chp_bccompanies`, `statecode eq 0`, select `chp_bccompanyid,chp_bccompanyguid,chp_name`.
2. **For each company** (sequential is fine; concurrency 1 keeps variable appends simple): the existing steps — `MCRMContacts` by lower-cased email + `customerPortalAccess eq true and type eq 'Person'` → company contact nos. → `mcrmBusinessRelation` → customer nos. — with `companies(<chp_bccompanyguid>)` in the BC URL. Append each distinct customer as an object `{ companyRowId, companyId, companyName, customerNo }` to an array variable.
3. **Q10 across companies:** 0 entries → `ok` (no match, as today). More than 1 entry → ops email + `needs_help`. The ops email lists `<company name> <customer no.>` pairs. A same customer no. in two companies counts as **two** entries.
4. **Exactly one:** continue as today, with the company coming from the entry: `mcrmCustomers` name lookup in that company, `List_accounts` filtered by customer no. **and** that company ID, `Create_account` writes `chp_bccompanyid` and `chp_bccompanyname` from the entry. All other ops emails (several contacts, linked elsewhere) name the company too.
5. **Pending grants:** `List_pending_grants` also filters `_chp_company_value eq <companyRowId>`.
6. Empty companies table → behave like "no match" (`ok`, no invitation) so the page never leaks config state; this is a misconfiguration, not a customer case.
7. Keep every existing behavior and status the flow tests cover: email validation, quote doubling in OData literals, the 10-minute cooldown, already-active, several contacts, linked elsewhere, `secureData` on BC calls, no `chp_BCSolidCementCompanyId` reference left.

## 3. Access grants

**Schema:** add lookup `chp_Company` (display "Company") on `chp_accessgrant` → `chp_bccompany`, required, delete behavior Restrict (a company with grants can't be deleted). Backfill every existing grant to the Solid Cement row **before** setting the column required (script does: create optional → backfill → set required).

**Admin form/view (`scripts/dataverse/admin_form_view.py`):** Company sits after Email, before BC Customer No. Add a Company column to "Active Access Grants".

**Grant flow (`scripts/dataverse/grant_flow.json`):**
- Trigger `filteringattributes` adds `chp_company`.
- `Get_grant` selects `_chp_company_value`; get the company row's `chp_bccompanyid`.
- `Get_parent_account` selects `chp_bccompanyid` too. `Customer_matches` requires customer no. **and** company ID to match; otherwise status stays **Customer mismatch** (no new status).

## 4. Docs to update

- Architecture doc: companies table replaces "env var per company"; Q10 row (now across companies, decided); remove "Solid Cement only for now".
- CLAUDE.md: BC companies line, env var list (drop `chp_BCSolidCementCompanyId`), mention `chp_bccompany`.
- Implementation plan: S1-12 status + notes; S1-14 gets "seed BC Companies rows per environment".
- Registration doc §7 (Q10): across companies.

## 5. Tests

- Update `test/flows/activation_flow.test.ts` and `test/flows/grant_flow.test.ts` (structural JSON tests): loop over company rows, company in BC URL from the row, Q10 counts company+customer pairs, account lookup/create use the entry's company, grants filtered by company, grant match on customer no. + company, no reference to `chp_BCSolidCementCompanyId`.
- Server Logic needs no change; existing `test/server-logic/*` stay green.

## 6. Live acceptance (Dev)

1. Existing Solid Cement test contact (C00000009 BESTRADE) still activates → Account company = Solid Cement; portal unchanged.
2. `michael+c2-apo@…` activates → Account `chp_bccompanyid` = APO, "Viewing **APO Cement** · <customer>"; orders, ledger, sites, documents, dashboard and Account page show only APO data (spot-check against BC APO, and confirm none of Solid C00000002's data appears).
3. **Ordering in scope:** that APO user gets a price quote and submits a cash order; the order lands in BC **APO** with the right receiving time and payment method `CASH`.
4. `michael+c2@…` → `needs_help`; ops email lists "Solid Cement C00000002" and "APO Cement C00000002".
5. A grant (APO, C00000002, `michael+c2-apo@…`) applies; editing it to Solid Cement → Customer mismatch and the role is removed.
6. Existing grants show Company = Solid Cement after backfill.

## Left to the builder

- Flow action names and exact loop shape (Apply to each vs. Select over pre-fetched results), as long as the JSON tests and behaviors above hold.
- Whether table creation lives in `identity_schema.py` or a new `companies_schema.py` script.
- Ops email wording beyond "include company name".
