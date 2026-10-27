# S1 Sub-project B — Identity, Auth and Access on Dev (Design)

**Date:** 2026-10-04
**Plan tasks:** S1-02 (identity model), S1-04 (auth site settings + header), S1-05 (web roles + runbook), S1-07 (`me` endpoint), S1-13 (access grants + internal admin app)
**Order:** A (done) → **B (this)** → C (BC-connected: S1-06 helper template, S1-03 activation flow)
**Environment:** Dev only (*CHP Customer Portal*, `https://org380257ac.crm5.dynamics.com/`; site `https://chp-portal-dev.powerappsportals.com`, private)

## Goal

Make sign-in real on the Dev site:
- an invited contact sets a password, signs in, and lands on the Dashboard;
- the app gets the contact's account and web roles from the real `me` Server Logic instead of the dev-server mock;
- CHP ops can pre-grant Full Access by email.

**Done when:** every check in *Live acceptance* below passes on Dev.

## Decisions (2026-10-04)

| Topic | Decision |
|---|---|
| Scope | S1-02, S1-04, S1-05, S1-07 **and** S1-13 (the user chose to include S1-13 before Rene confirms) |
| How it lands | **Build in Dev inside the `ConcreatHub` solution** using the Dataverse/Power Pages tooling. Site metadata (settings, header, roles, table permissions, Server Logic) lives as YAML/JS under `.powerpages-site/` in git. The Dataverse schema reaches UAT/Prod later by solution export/import |
| Test users | Seeded through invitations: one sample Account and five Contacts with made-up `@example.com` emails; links handed over, nothing emailed |
| `chp_accountlink` | Custom table with two lookups, not a native N:N |
| Grants | `chp_accessgrant` holds a **choice** of the four business roles (not a lookup: web roles are virtual records over `powerpagecomponent` in the enhanced data model, and a lookup would let ops pick Administrators), with a status; applied by a Power Automate flow that maps the choice to the role by name |
| Contact with no account | `me` returns `account: null`; the app shows the "access being set up" page |
| Changing Dev | Each environment change (schema, app, flow, deploy, test data) needs the user's approval when it happens; the site stays private |

## 1. Dataverse data model (S1-02, S1-13)

All components are created in the `ConcreatHub` solution. Publisher prefix `chp_`; choice values start at 775000000.

### Account (existing table): new columns

| Column | Type | Notes |
|---|---|---|
| `chp_bccustomerno` | Text (20) | BC Customer No. |
| `chp_bccompanyid` | Text (36) | BC company GUID. Always filled from environment variable `chp_BCSolidCementCompanyId` (later per company), never hardcoded |
| `chp_bccompanyname` | Text (100) | "Solid Cement" / "APO Cement", shown in the topbar |

- **Alternate key** `chp_bccustomer` on (`chp_bccustomerno`, `chp_bccompanyid`). This allows one mirror per BC customer per company, and activation (C) can find-or-create in one call.
- `name` holds the BC customer name. No balances, addresses or terms are stored (architecture rule 1).

### `chp_accountlink` (new, organization-owned)

| Column | Type |
|---|---|
| `chp_name` (primary) | Text (200), e.g. "10482 · J.D. Santos" |
| `chp_contact` | Lookup → Contact, required |
| `chp_account` | Lookup → Account, required |

- Alternate key on (`chp_contact`, `chp_account`).
- `Contact.parentcustomerid` remains the **active** account. The Phase 2 switcher adds link rows and changes `parentcustomerid`.

### `chp_accessgrant` (new, organization-owned)

| Column | Type | Notes |
|---|---|---|
| `chp_email` (primary) | Text (100), required | Matched against `contact.emailaddress1`, ignoring case |
| `chp_bccustomerno` | Text (20), required | The grant applies only if the contact's account has this customer no. |
| `chp_webrole` | Choice, required | Full Access (775000000) · Orders & Delivery (775000001) · Finance & Documents (775000002) · View Only (775000003). Normally Full Access |
| `chp_status` | Choice, default Pending | Pending (775000000) · Applied (775000001) · Customer mismatch (775000002) · Duplicate email (775000003) |
| `chp_contact` | Lookup → Contact | Set when applied |
| `chp_appliedon` | Date and time | Set when applied |
| `chp_note` | Multiline text (2000) | For ops |

### Test data (one-off, idempotent script, Dev only)

- **1 Account:** 10482 · J.D. Santos Hardware & Construction Supply · `chp_bccompanyname` "Solid Cement". `chp_bccompanyid` is read from `chp_BCSolidCementCompanyId`. This mirrors the wireframe sample and is replaced by real BC customers in C.
- **5 Contacts:**

  | Email | Last name | Web role |
  |---|---|---|
  | `full@example.com` | Test Full Access | Full Access |
  | `orders@example.com` | Test Orders | Orders & Delivery |
  | `finance@example.com` | Test Finance | Finance & Documents |
  | `viewonly@example.com` | Test View Only | View Only |
  | `norole@example.com` | Test No Role | none |

  Every contact has `parentcustomerid` = the Account and one Account Link row. The Dev Contact table's required columns from another project (`rpn_quickbooksid`, `rpn_vendordisplayname`) are sent empty.
- **Invitations:** one per contact. Fields are as in the POC flow (Registration doc §4.4):
  - `adx_type` = Single (756150000)
  - `adx_invitationcode` = random 32 hex characters
  - `adx_maximumredemptions` = 1
  - `adx_expirydate` = now + 7 days
  - linked to the contact and to the site (`mspp_websiteid` → `powerpagesites`)
- **Idempotent:** re-running reuses existing rows by email, customer no. or code, so it never creates a second contact with the same email. It prints `https://chp-portal-dev.powerappsportals.com/activate/complete?code=<code>` for each contact.

## 2. Site configuration (S1-04, S1-05)

Everything here is YAML under `.powerpages-site/`, committed and deployed with the site.

### Auth site settings

| Setting | Current | Target | Why |
|---|---|---|---|
| `Authentication/Registration/OpenRegistrationEnabled` | true | **false** | No self-registration without an invitation |
| `Authentication/Registration/LocalLoginByEmail` | missing | **true** | The app posts `Email` |
| `Authentication/Registration/ResetPasswordEnabled` | missing | **true** | "Forgot password?" uses the built-in page |
| `Authentication/Registration/EmailConfirmationEnabled` | true | **false** | The invitation link proves the email |
| `Authentication/Registration/ProfileRedirectEnabled` | true | **false** | Otherwise users land on `/profile` |
| `Authentication/Registration/ExternalLoginEnabled` | true | **false** | Customers use local sign-in only |
| `Authentication/Registration/AzureADLoginEnabled` | true | **false** | Same |
| `Authentication/Registration/CaptchaEnabled` | missing | false | The app can't render the server CAPTCHA |
| `Authentication/Registration/IsCaptchaEnabledForRegistration` | missing | false | Same |
| `Authentication/Registration/LocalLoginEnabled`, `…/Enabled`, `…/InvitationEnabled` | true | true | Unchanged |

- **Password policy:** left on Power Pages defaults (`EnforcePasswordPolicy` true, `RequiredLength` 8). These match the Set password screen; if they ever change, change `SetPassword.tsx` with them.
- **Check on Dev:** the private-site gate uses its own Entra sign-in, separate from the portal's Entra login provider. If turning off `AzureADLoginEnabled` blocks makers from viewing the private site, turn it back on and record why in this spec.
- **Planning confirms on Microsoft Learn:** whether `Authentication/Registration/RequiresInvitation` is also needed.

### Code-Site-Shell-Header web template

- Port the POC template `Code-Site-Shell-Header` unchanged and point `website.yml → headerwebtemplateid` at it. `pac pages upload-code-site` wipes the default Header template on every upload.
- Redirects:

  | Server path | App route |
  |---|---|
  | `/account/login/redeeminvitation?invitation=X` | `/activate/complete?code=X` |
  | `/account/login/register?invitationCode=X` (any casing of the parameter) | `/activate/complete?code=X` |
  | `/register` | `/activate` |
  | `/signin` | `/` |

### Web roles

- New: **Full Access**, **Orders & Delivery**, **Finance & Documents**, **View Only**. None is the anonymous or authenticated default role.
- Existing roles are unchanged: Administrators, Anonymous Users, Authenticated Users.

### Table permissions

Least privilege; everything else is denied by default.

| Name | Table | Scope | Privileges | Web role |
|---|---|---|---|---|
| Contact – self | contact | Self | Read | Authenticated Users |
| Account – own account | account | Account (the contact's parent account) | Read | Authenticated Users |

- `chp_accountlink` and `chp_accessgrant` have **no** portal permission.
- No `Webapi/<table>/enabled` site settings, so the browser can't query Dataverse.
- Planning confirms on Microsoft Learn that:
  - Account scope on the `account` table grants the contact's own parent account;
  - Server Logic Dataverse calls are subject to these permissions.

### Runbook (`docs/runbooks/portal-access.md`)

One page for CHP ops:
- the role → section map;
- giving or changing a role (Portal Management → Contacts → Related → Web Roles);
- pre-granting in Concreat Connect Admin, and what each grant status means;
- removing access (remove the role, or deactivate the Contact). Deleting a grant does not remove a role;
- the D4 default: activation alone gives no business role.

## 3. `me`, grants, admin app

### `me` Server Logic (S1-07)

- **Record:** `me`, assigned to web role **Authenticated Users**, built with the `/add-server-logic` skill under `.powerpages-site/server-logic/`.
- **`get()`:**
  1. If `Server.User` is missing, throw. The web role already makes the runtime reject anonymous callers; this is a second guard.
  2. One read: `contacts(Server.User.contactid)` with `$select=fullname,emailaddress1&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyname)`.
  3. If `parentcustomerid_account` is empty (no parent, or the parent is a Contact) → `account = null`.
  4. Otherwise map the expanded account to `{ customerNo, customerName, company }`.
  5. Return `JSON.stringify({ contact: { name, email }, account: { customerNo, customerName, company } | null, roles })`, with `roles` = web role names from `Server.User.Roles`.
- Reads nothing from the query string or body; the session decides everything (architecture rule 3).
- **Code rules:** no `require`/`import`, `eval`, `setTimeout`, `delete`, `prototype` or `Reflect.`.
- **Planning confirms on Microsoft Learn and the plugin reference:**
  - the exact shapes of `Server.User` (including `Roles`) and of the Dataverse connector's responses;
  - how a thrown error appears in the response envelope. Any error text a customer can see must be customer-safe (final-review item #2 from A).

### App changes (sub-project A code)

- `src/api/types.ts`: `MeDto.account` becomes `{ customerNo; customerName; company } | null`.
- `AppShell`: with `account === null`, show the existing `NoAccess` page and hide the topbar's "Viewing…" line and the drawer's account row.
- New dev mock email `nolink@test.ph` returns `account: null` with Full Access.

### Grant flow (S1-13)

- **Flow:** "Concreat Connect – Apply access grant", a solution-aware cloud flow in `ConcreatHub` with a Dataverse connection reference.
- **Trigger:** Dataverse *When a row is added or modified* on `chp_accessgrant`. Watched columns are `chp_email`, `chp_bccustomerno` and `chp_webrole`, so the flow's own status updates don't re-trigger it.
- **Steps:**
  1. List active contacts where `emailaddress1` equals the grant email (OData-escaped with doubled single quotes, `$top 2`; Dataverse string comparison ignores case).
  2. Branch on the result:

     | Contacts found | Action |
     |---|---|
     | none | leave **Pending** (C's activation applies Pending grants) |
     | two or more | set **Duplicate email** |
     | one | read its parent account's `chp_bccustomerno` (step 3) |

  3. For one contact:
     - if the customer no. equals the grant's → find the site's web role named like the grant's choice label and associate it with the contact (relationship `powerpagecomponent_mspp_webrole_contact`), then set **Applied**, `chp_contact` and `chp_appliedon`;
     - otherwise → set **Customer mismatch** and grant nothing.
- **Revoking is out of the flow:** deleting a grant does not remove a role.

### Admin app (S1-13)

- **App:** model-driven app **Concreat Connect Admin** in `ConcreatHub`. Its sitemap has one area, **Access grants**: the main form plus an "All grants" view (email, customer no., role, status, applied on, modified on).
- **Security role "Concreat Connect Admin":**
  - organization-level create/read/write/delete on `chp_accessgrant`;
  - read on `contact` (for the applied-contact lookup);
  - access to the app.
- **Open item for Rene / CHP IT:** each CHP staff user needs a Power Apps license that covers custom Dataverse tables.

## Testing

### Vitest

- **`me` Server Logic:** the record's JS file runs inside a test harness (`new Function` over the file text) against a fake `Server` object, covering:
  - anonymous → throws;
  - linked account → DTO;
  - no parent → `account: null`;
  - parent is a contact → `account: null`;
  - roles passed through.
- **App:** `account: null` → NoAccess page, no "Viewing…" line, no drawer account row.

### Live acceptance on Dev

The private site, viewed while signed in to the org.

1. Each test invitation link → Set password → Dashboard showing that role's nav. `norole@` sees the access-pending page.
2. `/SignIn` redirects to `/`; `/register` redirects to `/activate`.
3. Anonymous `GET /_api/serverlogics/me` is rejected.
4. `/Account/Login/Register` with no code offers no registration.
5. Re-opening a used invitation link shows "This link has expired". Capture the real Power Pages HTML, map it to `InvalidInvitationError` if needed, and replace the session-test fixture with it. This closes final-review item #3 from A.
6. Grants:
   - Full Access grant for `norole@example.com` + 10482 → **Applied**, and that user now sees the Full Access nav;
   - same email with customer 99999 → **Customer mismatch**;
   - an unknown email → **Pending**.

## Deployment (each step approved by the user when it happens)

1. `pac auth who` confirms the Dev environment.
2. Create the Dataverse columns, tables, keys, security role, app and flow in `ConcreatHub`.
3. Run `npm run build`, then `pac pages upload-code-site --rootPath .` (never `pac pages upload`).
4. Run the test-data script and hand over the invitation links.
5. Run the live acceptance checks and record results in the implementation plan's notes. Statuses for S1-02, S1-04, S1-05, S1-07 and S1-13 change to ✅ Done (Dev).

## Out of scope

- Activation flow and every BC call (C)
- Account switcher (Phase 2)
- UAT/Prod pipeline (S0-08)
- Real customer data
- Revoke-access UI (S4-08)

## Open items for the client

- Power Apps licensing for CHP staff using Concreat Connect Admin
- Confirm the internal admin app against the "no user management in the portal" direction (D4)
- Q6 and D4, as carried over from sub-project A
