# S1 Sub-project C — BC Helper Template and Activation (Design)

**Date:** 2026-10-04 · **Plan tasks:** S1-06 (Server Logic BC helper template), S1-03 (activation flow)
**Order:** A (done) → B (done on Dev) → **C (this)**
**Environment:** Dev only. Power Platform *CHP Customer Portal* (`org380257ac`); private site `https://chp-portal-dev.powerappsportals.com`; BC environment **`DEV`** (renamed from TRAINING), company **Solid Cement Corporation** `d2e4496e-be79-f111-8070-6045bd2058e3`.

## Goal

1. Server Logic can call BC as the portal's app identity, scoped to the signed-in contact's own customer. The `company` endpoint proves this.
2. A Solid Cement customer contact can activate a portal account from the site. A unique match gets a single-use invitation by email; a duplicate email (Q10) is blocked and ops are told. Any Pending access grant is applied on activation.

**Done when:** every check in *Live acceptance* passes on Dev.

## Decisions (2026-10-04)

| Topic | Decision |
|---|---|
| BC auth | Client credentials (client ID + secret) supplied by the BC team. The Entra app itself is managed by BC |
| Secret storage | **Exception, Dev only:** `chp_BCClientSecret` is a **plain-text** Dataverse environment variable with **no default value**. The user sets its value only in Dev, in the maker portal. It never appears in chat, files or git. Moving it to Key Vault is part of S1-14 (before UAT). Record the exception in CLAUDE.md and the architecture doc |
| Secret hygiene | The secret is also in the shared Postman file, so the BC team should rotate it before UAT |
| Activation trigger | Anonymous Users web role. Activation happens before a portal login exists. Everything else stays signed-in only |
| Q10 (email on more than one customer) | **Block**: no invitation; ops are notified with the email and the matching customer numbers |
| Sender | The user's own mailbox for Dev (`chp_SenderMailbox`). Ops notices go to the same address. Swap to CHP's shared mailbox when Q8 is resolved |
| Approach | Activation is a Power Automate flow (all writes under the flow's identity; anonymous visitors get no Dataverse permissions). Live BC reads use Server Logic with a shared, generated helper block |

## BC DEV facts (probed 2026-10-04, read-only)

| Fact | Detail |
|---|---|
| Customer API | `api/pasi/mcrm/v1.0/companies({id})/mcrmCustomers`. Fields used: `Customer_No`, `Name`, `Address`, `Address_2`, `City`, `County`, `Post_Code`, `VATRegNo`, `Phone_No`, `EMail`. **No Blocked field. No website field** |
| Contact API | `MCRMContacts`: `no`, `type` (`Company`/`Person`), `companyNo`, `eMail`, `name`, `privacyBlocked` |
| Contact → customer | `mcrmBusinessRelation`: `contactNo` = the company contact's `no`, `linktoTable eq 'Customer'`, and **`vendorNo` = the customer no.** (the field name is misleading) |
| Case | `eMail eq '…'` is case-sensitive; `tolower(eMail) eq '<lowercased>'` matches regardless of case |
| Query encoding | Build query strings with a proper encoder. A hand-encoded `&` made BC answer a misleading 401 |
| Test data | **C00000009 · BESTRADE COMMODITY SALES CORP.**: contacts use the developer's own address, which resolves to only this customer. **`ai…@pasi.ph`** is on the contacts of four or more customers, which makes it the Q10 test |

## 1. Configuration and secrets

### Environment variables (`ConcreatHub`)

| Variable | Action | Dev value |
|---|---|---|
| `chp_BCEnvironmentName` | update | `DEV` |
| `chp_BCSolidCementCompanyId` | update | `d2e4496e-be79-f111-8070-6045bd2058e3` |
| `chp_BCTenantId` | keep | BC tenant `188fc244…` |
| `chp_BCApiBasePath` | keep | `/api/pasi/mcrm/v1.0` |
| `chp_SiteUrl` | keep | `https://chp-portal-dev.powerappsportals.com` |
| `chp_SenderMailbox` | set | the developer's mailbox |
| `chp_BCClientId` | **new**, text | client ID from the BC team |
| `chp_BCClientSecret` | **new**, text, no default | set by the user in the maker portal |
| `chp_PowerPagesSiteId` | **new**, text | `f44e98b4-3da3-4f8d-8f79-fbb244454741`. Used by the activation flow for the invitation's site; S1-14 switches the grant flow to it too |

### Site settings for Server Logic

Each setting is linked to its environment variable with `create-site-setting.js --envVarSchema`:

| Setting | Variable |
|---|---|
| `BC/TenantId` | `chp_BCTenantId` |
| `BC/EnvironmentName` | `chp_BCEnvironmentName` |
| `BC/ApiBasePath` | `chp_BCApiBasePath` |
| `BC/ClientId` | `chp_BCClientId` |
| `BC/ClientSecret` | `chp_BCClientSecret` |

- The BC **company** is never a setting. Server Logic always takes it from the signed-in contact's Account (`chp_bccompanyid`), as architecture rule 3 requires.
- Site settings are readable only server-side (`Server.SiteSetting.Get`). No Liquid or Web API exposes them.

## 2. S1-06 — BC helper template and `company`

### One source, generated copies

- **Source:** `server-logic-src/bc-helpers.js`. It holds the helper functions as plain function declarations, the body of a block.
- **Stamping:** `scripts/stamp-server-logic-helpers.mjs` writes that body into every `.powerpages-site/server-logic/*/*.js` that contains the markers:

  ```js
  // #region bc-helpers (generated from server-logic-src/bc-helpers.js — do not edit)
  // #endregion bc-helpers
  ```

  The block sits **inside** each verb function, because Server Logic allows only `get`/`post`/`put`/`patch`/`del` at top level.
- **Check mode:** `--check` exits non-zero if any copy differs. A Vitest test calls the same comparison.
- The helpers use only arrow callbacks and no banned patterns (`Function(`, `prototype`, `eval`, `setTimeout`, `delete`, `Reflect.`, `with(`, `require`, `import`, `console.log`).
- `me` stays as it is: it needs no BC helpers.

### Helpers

| Helper | Contract |
|---|---|
| `bcConfig()` | Reads the 5 site settings and returns `{ tenantId, environment, basePath, clientId, clientSecret }`. Throws `bc-config` if any is empty |
| `sessionScope()` | Reads `Server.User.contactid`, then `contacts(id)?$select=contactid&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyid)`. Returns `{ contactId, customerNo, companyId, customerName }`. Throws `not-signed-in` or `no-account`. Reads **nothing** from `Server.Context` |
| `bcToken(cfg)` | `await HttpClient.PostAsync("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token", form, {}, "application/x-www-form-urlencoded")`, where `form` contains `grant_type=client_credentials`, `client_id`, `client_secret` and `scope=https://api.businesscentral.dynamics.com/.default`, built with `encodeURIComponent`. Cached for this invocation only. Throws `bc-auth` on a non-2xx |
| `bcGet(scope, entity, query)` | `GET https://api.businesscentral.dynamics.com/v2.0/{tenant}/{env}{basePath}/companies({scope.companyId})/{entity}?{query}` with a Bearer token. Returns the parsed body. A non-2xx throws `bc-<status>` |
| `bcPost(scope, entity, body)` | Same, with a POST and JSON body |
| `odataLiteral(value)` | `"'" + String(value).replace(/'/g, "''") + "'"` |
| `respond(work)` | Runs `work()`. On success returns `JSON.stringify(result)`. On failure logs the detail with `Server.Logger.Error` and throws a customer-safe `Error("We couldn't load this information. Please try again.")` |

HttpClient and connector results can arrive as JSON strings or `{ StatusCode, Body }` envelopes. The helpers parse both shapes, the same way `me` does.

### `company` endpoint

- **Web roles:** Full Access, Orders & Delivery, Finance & Documents, View Only.
- **`get()`:**
  1. `scope = sessionScope()`.
  2. `bcGet(scope, 'mcrmCustomers', '$filter=Customer_No eq ' + odataLiteral(scope.customerNo) + '&$select=Customer_No,Name,Address,Address_2,City,County,Post_Code,VATRegNo,Phone_No,EMail')`.
  3. **Ownership check:** exactly one row, and its `Customer_No` must equal `scope.customerNo`. Anything else throws `not-found`.
  4. Return `{ customerNo, customerName, address, vatRegNumber, phone, email }`. `address` joins the non-empty address parts with ", ". Names follow the wireframe's `ACCOUNTS`.
- **App:** add a `CompanyDto` type and a `company` dev mock (the wireframe `ACCOUNTS[0]` values). No screen uses it until S2-19.

## 3. S1-03 — Activation flow

### Flow

- **Name:** "Concreat Connect – Request activation"; a solution-aware flow in `ConcreatHub`. Its definition lives in `scripts/dataverse/activation_flow.json` and is deployed by the idempotent `scripts/dataverse/activation_flow.py`, in the same pattern as `grant_flow.*`.
- **Trigger:** *When Power Pages calls a flow*, with one text input titled **`Email`**.
- **Site registration:** a cloud-flow-consumer record for **Anonymous Users**, created with `/add-cloud-flow`. Fix `flowapiurl` if Git Bash rewrites the leading `/` (CLAUDE.md gotcha).
- **Connections:**
  - the Dataverse connection reference (reuse `chp_dataverse`);
  - an Office 365 Outlook connection reference (new, the developer's account);
  - the HTTP action, which needs no connection reference.

### Steps

1. `email` = the trigger's **Email** input, trimmed and lower-cased. If it contains no `@` or a space → return OK.
2. Read the environment variables (tenant, environment, base path, Solid Cement company ID, client ID, client secret, site URL, site ID, sender). The client-secret and token steps use **secure inputs/outputs**.
3. **Token:** HTTP POST to `login.microsoftonline.com/{tenant}/oauth2/v2.0/token`, form-encoded client credentials.
4. **Contacts:** GET `MCRMContacts` with `$filter=tolower(eMail) eq '<email, ' doubled>'`, `$select=no,type,companyNo,name`, `$top=20`, with the query encoded properly.
5. **Customers:** for each distinct `companyNo`, GET `mcrmBusinessRelation` with `$filter=contactNo eq '<companyNo>' and linktoTable eq 'Customer'`, `$select=vendorNo`. Collect the distinct `vendorNo` values.
6. **Branch on the number of distinct customers:**
   - **0** → return OK.
   - **More than 1** → send the ops notice to `chp_SenderMailbox`, subject "Concreat Connect: activation blocked — email on several customers", body with the email and customer numbers. Return OK.
   - **Exactly 1** → continue.
7. **Customer:** GET `mcrmCustomers` with `$filter=Customer_No eq '<no>'`, `$select=Customer_No,Name`.
8. **Account:** list `accounts` where `chp_bccustomerno eq '<no>' and chp_bccompanyid eq '<company id>'`.
   - If none, create it with `name`, `chp_bccustomerno`, `chp_bccompanyid` and `chp_bccompanyname` = "Solid Cement". The label is fixed while the portal is Solid Cement only; S1-12 maps company → label.
   - Otherwise, update `name`.
9. **Contact:** list `contacts` where `emailaddress1 eq '<email>'`. Dataverse comparison ignores case.
   - **More than 1** → ops notice ("several portal contacts share this email"), return OK.
   - **One, whose `parentcustomerid` is a different account** → ops notice ("already linked to another customer"), return OK.
   - **One, unlinked or the same account** → set `parentcustomerid` to the account if it's unlinked.
   - **None** → create it with `lastname` = the BC person contact's `name` (or the customer name if the match was the company contact), `emailaddress1`, and `parentcustomerid`.
10. **Account Link:** create a `chp_accountlink` (`chp_name` = "<customer no> · <contact name>") if none exists for this contact and account.
11. **Pending grants:** list `chp_accessgrants` where `chp_email eq '<email>' and chp_bccustomerno eq '<no>' and chp_status eq 775000000`. For each, update `chp_bccustomerno` to the same value; this re-triggers the grant flow, which now finds the contact and applies the grant.
12. **Already activated?** If the contact has `adx_identity_username` set → return OK. No new invitation.
13. **Invitation:** create an `adx_invitation`:
    - `adx_name` = "Activation – <email>", `adx_type` = 756150000 (Single);
    - `adx_invitationcode` = `replace(guid(), '-', '')`;
    - `adx_maximumredemptions` = 1, `adx_expirydate` = `addDays(utcNow(), 7)`;
    - `adx_inviteContact` → the contact, `mspp_websiteid` → `powerpagesites(<chp_PowerPagesSiteId>)`.
14. **Email:** Outlook "Send an email (V2)" to `email`.
    - Subject **"Activate your Concreat Connect account"**.
    - HTML body: greeting with the contact name; "Use the link below to set your password and finish activating your Concreat Connect account."; a button/link to `{chp_SiteUrl}/activate/complete?code={code}`; "This link can be used once and expires in 7 days."; "If you didn't ask for this, you can ignore this email."; the support line "Need assistance? Contact Concreat Customer Service Center at (02) 8849-3600."
15. Return `{"status":"ok"}`.

### Errors and privacy

- Every *business* outcome returns the same OK: no match, Q10, contact conflicts, already active, sent. The page always shows "Check your email".
- **Technical** failures fail the run: token, BC, Dataverse, Outlook. The app receives a non-200 and shows "We couldn't send the activation email right now. Please try again in a few minutes." The run history keeps the detail, with the secret masked.
- The flow reads only `Email`; anything else in the request body is ignored.

### App wiring

- **Flow ID:** `.env.production` (committed) contains `VITE_ACTIVATION_FLOW_ID=<Dev flow id>`. `session.ts` already reads it. Per-environment builds are part of S1-14.
- **No other app code changes** for activation.

## 4. Test data changes

`seed_dev_test_users.py` changes so that:
- the test Account uses **C00000009 · BESTRADE COMMODITY SALES CORP.** under the DEV company ID (replacing the wireframe's 10482);
- the five `@example.com` contacts move to that Account (their links follow, and the old 10482 Account is left without contacts);
- the old 10482 Account is **deactivated**, not deleted (Restrict on delete).

## Testing

### Vitest (run before every deploy)

- **Copies:** every helper block equals `server-logic-src/bc-helpers.js`, and none contains a banned pattern.
- **Helpers** (harness with a fake `Server`, like `me`):
  - `odataLiteral` doubles quotes;
  - `sessionScope` throws `not-signed-in` / `no-account`, and its result is the same whatever `Server.Context.QueryParameters` and `Body` contain;
  - `bcToken` posts the expected form fields to the expected URL and throws on a 401 response;
  - `bcGet` builds the URL with the scope's company ID and throws on a 4xx/5xx.
- **`company`:**
  - maps a BC row to the DTO;
  - fails when BC returns a different `Customer_No` or no row;
  - escapes a customer no. containing `'`.
- **Activation flow definition** (structure test, like the grant flow):
  - the trigger input is `Email`;
  - the email is lower-cased;
  - the contact filter uses `tolower(eMail)` and doubles quotes;
  - the switch on the customer count has 0 / 1 / default branches;
  - every terminating branch returns OK;
  - the secret and token actions have secure inputs/outputs.

### Live acceptance on Dev

1. `company` as full@ (after re-seeding) returns BESTRADE's card. Calling it as a signed-in user with no business role → 403.
2. **Activation, unique match:**
   - the developer's address → an email arrives → Set password → signed in;
   - C00000009's Account, the contact and the link exist;
   - the user sees "being set up" (no role) unless a grant exists.
3. **Q10:** `ai…@pasi.ph` → same screen, no invitation, and the ops notice lists its customers.
4. **Unknown email:** same screen, no email, no Dataverse rows created.
5. **Already active:** activate the developer's address again → no new invitation.
6. **Pending grant:** reset the developer's contact roles, create a grant (developer email + C00000009 + Orders & Delivery), then activate. The grant shows **Applied**, and the user sees the Orders & Delivery sections.
7. **Technical failure:** temporarily clear `chp_BCClientSecret` → the run fails and the app shows "We couldn't send…". Then restore it.

## Deployment (each step approved by the user when it happens)

1. Update and create the environment variables. The user sets the client-secret value in the maker portal.
2. Add the site settings, the `company` Server Logic and the flow registration. Deploy with `pac pages upload-code-site` after `pac auth who`.
3. Create the flow with `activation_flow.py` and register it on the site.
4. Re-seed the test users.
5. Run the live acceptance, then update the implementation plan: S1-06 and S1-03 → ✅ Done (Dev).

## Out of scope

- APO Cement (S1-12)
- Moving to Key Vault, per-environment builds, rotating the secret (S1-14 / BC team)
- Blocked-customer checks (no BC field yet)
- CAPTCHA
- Real customer data in UAT/Prod
- The S2 modules that use `company`

## Open items

### For the BC team

- A **Blocked** field on `mcrmCustomers`, so blocked customers can be skipped at activation.
- A **website** field on `mcrmCustomers` (wireframe company info).
- **Rotate** the client secret that sits in the shared Postman file, or issue a portal-only app, before UAT.
- Rename `mcrmBusinessRelation.vendorNo` to a neutral name (it holds customer numbers).

### For CHP

- Shared sender mailbox (Q8).
- Ops notice recipient: who in CHP should get the Q10 and conflict notices (Dev uses the developer's mailbox).
