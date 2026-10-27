# S1 Identity, Auth and Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sign-in real on the Dev site. Invited test contacts set a password, sign in, and see their role's portal from the real `me` Server Logic. CHP ops can pre-grant roles by email from an internal admin app.

**Architecture:**
- **Dataverse schema:** created in Dev inside the `ConcreatHub` solution by idempotent Python scripts that call the Dataverse Web API, reusing `scripts/auth.py` for tokens.
- **Power Pages metadata:** site settings, the header template, web roles, table permissions and the `me` Server Logic are files under `.powerpages-site/`, written with the Power Pages plugin's deterministic scripts and deployed with `pac pages upload-code-site`.
- **Grants:** a Dataverse-triggered cloud flow applies them, and a model-driven app maintains them.

**Tech Stack:** Python 3.12 (`requests`, `scripts/auth.py`), Dataverse Web API v9.2, Power Pages code site metadata (YAML), Server Logic (server-side JavaScript), Power Automate, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-s1-identity-auth-design.md`

## Global Constraints

- **Target is Dev only:** `https://org380257ac.crm5.dynamics.com/`, site `https://chp-portal-dev.powerappsportals.com` (private), Power Pages site id `f44e98b4-3da3-4f8d-8f79-fbb244454741`.
- **Never touch BC, UAT or production.** The site stays private.
- **Stop for approval:** every step marked **APPROVAL** changes the Dev environment. Stop and get the user's explicit yes before running it (CLAUDE.md "Don't change environment settings … without explicit approval").
- **Solution:** every Dataverse component goes in solution `ConcreatHub`. Publisher prefix `chp_`; option values start at 775000000.
- **Secrets:** none are needed. Never hardcode environment values; the BC company id comes from environment variable `chp_BCSolidCementCompanyId`.
- **Server Logic code rules:**
  - Only the top-level functions `get`, `post`, `put`, `patch`, `del` are allowed (helpers are nested inside them).
  - Banned: `require`/`import`, `eval`, `setTimeout`, `delete`, `prototype`, `Reflect.`, `console.log`, and the substring `with(` anywhere.
  - Dataverse connector calls are synchronous.
- **Scope comes from the session only:** `me` reads nothing from the query string or body.
- **Deploy:** only with `pac pages upload-code-site --rootPath .`, never `pac pages upload`, after `pac auth who` shows the Dev environment.
- **Plugin scripts:** run from `C:\Users\Michael\.claude-work\plugins\cache\power-platform-skills\power-pages\2.6.6` (below as `$PP`). In Git Bash: `PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6`.
- **Known Dev values, confirmed 2026-10-04:**
  - web role ↔ contact relationship: `powerpagecomponent_mspp_webrole_contact`;
  - invitation lookups: `adx_inviteContact`, `mspp_websiteid`;
  - the `contact.parentcustomerid` → account relationship: `contact_customer_accounts`;
  - Authenticated Users web role id: `b2780841-e908-44f8-b7d8-dfd367bfeeb2`;
  - Dev has 0 contacts.
- **Tests:** Vitest for the app and for the Server Logic (through a harness). Python scripts are checked by `python -m py_compile` plus verification queries; they're run-once infrastructure.
- **Commits:** each commit message cites its task IDs (S1-02/04/05/07/13) and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

These are the failure modes the spec implies but its tests don't cover, most likely first. Each has a check in its owning task.

1. The Dataverse connector returns its result in a different shape than expected (a JSON string, or a `{StatusCode, Body}` envelope rather than a plain record). `me` must handle all three (Task 2 tests).
2. `Server.User.Roles` arrives as a comma-separated string or as objects rather than an array of names. `me` must still return a list of names (Task 2 tests).
3. Running a seed or schema script a second time must not create duplicate contacts, links, roles or invitations; a duplicate email blocks sign-in (Tasks 4 and 8: re-run step).
4. A grant whose email exists on a contact of a **different** customer must grant nothing (Task 9 acceptance).
5. A contact with no account, or whose parent is another contact, must see the access-pending page, not an error (Tasks 1 and 2).

---

## File Map

| File | Responsibility |
|---|---|
| `src/api/types.ts`, `src/mocks/index.ts`, `src/layout/AppShell.tsx`, `src/layout/MobileMenu.tsx` | App: `account` may be `null` |
| `.powerpages-site/server-logic/me/me.js` | `me` endpoint |
| `.powerpages-site/server-logic/me/me.serverlogic.yml` | Its metadata (web role: Authenticated Users) |
| `test/server-logic/me.test.ts` | Harness tests for `me.js` (kept outside `.powerpages-site` so it isn't uploaded) |
| `.powerpages-site/web-roles/*.webrole.yml` | 4 new business roles |
| `.powerpages-site/site-settings/*.sitesetting.yml` | Auth settings |
| `.powerpages-site/web-templates/code-site-shell-header/*` | Header redirect template |
| `.powerpages-site/website.yml` | Points `headerwebtemplateid` at the new template |
| `.powerpages-site/table-permissions/*` | Contact (Self) and Account (Contact scope) read permissions |
| `scripts/dataverse/dv.py` | Small shared Web API helper (session, GET/POST/PATCH, solution header) |
| `scripts/dataverse/identity_schema.py` | Account columns + key, `chp_accountlink`, `chp_accessgrant` |
| `scripts/dataverse/admin_role.py` | Security role "Concreat Connect Admin" |
| `scripts/dataverse/seed_dev_test_users.py` | Test Account, 5 contacts, links, roles, invitations |
| `docs/runbooks/portal-access.md` | Ops runbook |

---

### Task 1: The app accepts a contact with no account

**Files:**
- Modify: `src/api/types.ts`, `src/mocks/index.ts`, `src/layout/AppShell.tsx`, `src/layout/MobileMenu.tsx`
- Test: `src/layout/AppShell.test.tsx`

**Interfaces:**
- Produces: `MeDto.account: { customerNo: string; customerName: string; company: string } | null`, and the dev mock email `nolink@test.ph` (Full Access, `account: null`).

- [ ] **Step 1: Write the failing test** — append to `src/layout/AppShell.test.tsx`, before `test('Help lists all eight`:

```tsx
test('a contact not linked to an account sees the access-pending page, without the Viewing line', async () => {
  signInAs('nolink@test.ph')
  expect(await screen.findByRole('heading', { level: 1, name: 'Your portal access is being set up' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Portal sections' })).not.toBeInTheDocument()
  expect(screen.queryByText(/^Viewing/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/layout/AppShell.test.tsx -t "not linked"`
Expected: FAIL. `nolink@` currently gets the Full Access fixture with an account, so the access-pending heading isn't found.

- [ ] **Step 3: Implement**

`src/api/types.ts`: change the `account` line to

```ts
  /** null when the contact isn't linked to a customer account yet. company: "Solid Cement" | "APO Cement" */
  account: { customerNo: string; customerName: string; company: string } | null
```

and delete the old `/** company: … */` comment line above it.

`src/mocks/index.ts`:
- add `['nolink@test.ph', ['Full Access']],` to `ROLES_BY_EMAIL`;
- replace the `account:` line in `me` with:

```ts
      // Wireframe ACCOUNTS[0]; nolink@ simulates a contact that isn't linked to an account yet.
      account:
        email === 'nolink@test.ph'
          ? null
          : { customerNo: '10482', customerName: 'J.D. Santos Hardware & Construction Supply', company: 'Solid Cement' },
```

and remove the old `// Wireframe ACCOUNTS[0]` comment line.

`src/layout/AppShell.tsx`: first make `roles` empty when there's no account, so the access-pending branch, nav and drawer all follow. Replace

```tsx
  const roles = me.data?.roles ?? []
```

with

```tsx
  // No linked account means no business access yet, whatever the roles say.
  const roles = me.data?.account ? me.data.roles : []
```

Then guard the "Viewing…" line. Replace

```tsx
          {me.data && (
            <>
              <p className="hidden text-[13px] text-muted-foreground lg:block">
                Viewing <strong className="text-foreground">{me.data.account.company}</strong> · {me.data.account.customerName}
              </p>
```

becomes

```tsx
          {me.data && (
            <>
              {me.data.account && (
                <p className="hidden text-[13px] text-muted-foreground lg:block">
                  Viewing <strong className="text-foreground">{me.data.account.company}</strong> · {me.data.account.customerName}
                </p>
              )}
```

`src/layout/MobileMenu.tsx`: change `{me && (` (the account row) to `{me?.account && (`. Inside it, `me.account.customerName` and `me.account.company` keep working because the guard narrows the type.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run`
Expected: all pass (66 tests).

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/mocks/index.ts src/layout/AppShell.tsx src/layout/MobileMenu.tsx src/layout/AppShell.test.tsx
git commit -m "S1-07: app treats a contact without a linked account as access pending

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `me` Server Logic

**Files:**
- Create: `.powerpages-site/server-logic/me/me.js`
- Create (by script): `.powerpages-site/server-logic/me/me.serverlogic.yml`
- Test: `test/server-logic/me.test.ts`

**Interfaces:**
- Consumes:
  - `Server.User` (`contactid`, `Roles`);
  - `Server.Connector.Dataverse.RetrieveRecord(entitySet, id, options)`;
  - `Server.Logger`.
- Produces: `GET /_api/serverlogics/me` → `Data` = JSON string of `MeDto` (as in Task 1). On failure it throws `Error("We couldn't load your account details.")`.

- [ ] **Step 1: Write the failing test** — `test/server-logic/me.test.ts`

```ts
import { readFileSync } from 'node:fs'

// Runs the Server Logic file the way Power Pages does: top-level functions with a global `Server`.
const source = readFileSync(new URL('../../.powerpages-site/server-logic/me/me.js', import.meta.url), 'utf8')

function load(server: unknown): { get: () => string } {
  return new Function('Server', `${source}\nreturn { get }`)(server)
}

const ACCOUNT = { name: 'J.D. Santos Hardware & Construction Supply', chp_bccustomerno: '10482', chp_bccompanyname: 'Solid Cement' }

function fakeServer({ user = { contactid: 'c-1', Roles: ['Authenticated Users', 'Full Access'] } as unknown, record = {} as unknown } = {}) {
  const calls: unknown[][] = []
  return {
    calls,
    server: {
      User: user,
      Logger: { Log() {}, Error() {} },
      Connector: {
        Dataverse: {
          RetrieveRecord: (...args: unknown[]) => {
            calls.push(args)
            return record
          },
        },
      },
    },
  }
}

const contact = (parent: unknown) => ({ fullname: 'J.D. Santos', emailaddress1: 'full@example.com', parentcustomerid_account: parent })

test('returns the contact, the linked account and the roles', () => {
  const { server, calls } = fakeServer({ record: contact(ACCOUNT) })
  expect(JSON.parse(load(server).get())).toEqual({
    contact: { name: 'J.D. Santos', email: 'full@example.com' },
    account: { customerNo: '10482', customerName: 'J.D. Santos Hardware & Construction Supply', company: 'Solid Cement' },
    roles: ['Authenticated Users', 'Full Access'],
  })
  expect(calls).toEqual([
    [
      'contacts',
      'c-1',
      '$select=fullname,emailaddress1&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyname)',
    ],
  ])
})

test('a contact without a parent account gets account null', () => {
  const { server } = fakeServer({ record: contact(null) })
  expect(JSON.parse(load(server).get()).account).toBeNull()
})

test('accepts the record as a JSON string or inside a {StatusCode, Body} envelope', () => {
  const asString = fakeServer({ record: JSON.stringify(contact(ACCOUNT)) })
  expect(JSON.parse(load(asString.server).get()).account.customerNo).toBe('10482')
  const asEnvelope = fakeServer({ record: { StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify(contact(ACCOUNT)) } })
  expect(JSON.parse(load(asEnvelope.server).get()).account.customerNo).toBe('10482')
})

test('accepts roles as a comma-separated string or as objects', () => {
  const asString = fakeServer({ user: { contactid: 'c-1', Roles: 'Authenticated Users, View Only' }, record: contact(ACCOUNT) })
  expect(JSON.parse(load(asString.server).get()).roles).toEqual(['Authenticated Users', 'View Only'])
  const asObjects = fakeServer({ user: { contactid: 'c-1', Roles: [{ Name: 'View Only' }] }, record: contact(ACCOUNT) })
  expect(JSON.parse(load(asObjects.server).get()).roles).toEqual(['View Only'])
})

test('an anonymous caller gets a customer-safe error and no Dataverse call', () => {
  const { server, calls } = fakeServer({ user: null })
  expect(() => load(server).get()).toThrow("We couldn't load your account details.")
  expect(calls).toEqual([])
})

test('a failed Dataverse call becomes the same customer-safe error', () => {
  const { server } = fakeServer({ record: { StatusCode: 403, IsSuccessStatusCode: false, ReasonPhrase: 'Forbidden', Body: '' } })
  expect(() => load(server).get()).toThrow("We couldn't load your account details.")
})

test('uses no patterns the Power Pages validator rejects', () => {
  for (const banned of [/\brequire\(/, /\bimport\b/, /\beval\(/, /setTimeout/, /\bdelete\b/, /prototype/, /Reflect\./, /console\.log/, /with\(/]) {
    expect(source).not.toMatch(banned)
  }
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/server-logic/me.test.ts`
Expected: FAIL with `ENOENT … me.js`.

- [ ] **Step 3: Write `.powerpages-site/server-logic/me/me.js`**

```js
// Server Logic: me (S1-07)
// Purpose: the signed-in contact, their active account (Contact.parentcustomerid) and web roles.
// API URL: https://<site>/_api/serverlogics/me
// Scope comes only from the session (Server.User); nothing is read from the request.

function get() {
    // The connector may return the record, a JSON string, or a { StatusCode, Body } envelope.
    function asRecord(result) {
        var value = typeof result === "string" ? JSON.parse(result) : result;
        if (value && value.IsSuccessStatusCode === false) {
            throw new Error("Dataverse " + value.StatusCode + " " + value.ReasonPhrase);
        }
        if (value && typeof value.Body === "string") {
            value = JSON.parse(value.Body);
        }
        return value;
    }

    // Roles may arrive as an array of names, an array of { Name } objects, or a comma-separated string.
    function roleNames(roles) {
        var list = Array.isArray(roles) ? roles : String(roles || "").split(",");
        return list
            .map(function (role) {
                return typeof role === "string" ? role.trim() : String((role && (role.Name || role.name)) || "").trim();
            })
            .filter(function (name) {
                return name.length > 0;
            });
    }

    try {
        Server.Logger.Log("me GET called");
        var user = Server.User;
        if (!user || !user.contactid) {
            throw new Error("No signed-in contact");
        }

        var contact = asRecord(
            Server.Connector.Dataverse.RetrieveRecord(
                "contacts",
                user.contactid,
                "$select=fullname,emailaddress1&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyname)"
            )
        );
        var account = contact.parentcustomerid_account;

        return JSON.stringify({
            contact: { name: contact.fullname || "", email: contact.emailaddress1 || "" },
            account: account
                ? { customerNo: account.chp_bccustomerno || "", customerName: account.name || "", company: account.chp_bccompanyname || "" }
                : null,
            roles: roleNames(user.Roles)
        });
    } catch (err) {
        Server.Logger.Error("me GET failed: " + err.message);
        // Customers see this text; internal details stay in the log.
        throw new Error("We couldn't load your account details.");
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/server-logic/me.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Create the metadata and validate**

Run:

```bash
PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6
node "$PP/skills/add-server-logic/scripts/create-serverlogic-metadata.js" --projectRoot . --name me --displayName "Me (signed-in contact)" --description "Signed-in contact, active account and web roles for the SPA (S1-07)" --webRoleIds b2780841-e908-44f8-b7d8-dfd367bfeeb2
node "$PP/skills/add-server-logic/scripts/validate-serverlogic.js" --projectRoot .
```

Expected:
- the first command prints `{ "id": "<uuid>", "filePath": ".../me.serverlogic.yml" }`;
- the YAML lists `adx_serverlogic_adx_webrole: [b2780841-…]` and `name: me`;
- the validator reports no errors. If it takes different arguments, run it with `--help` and use what it asks for.

- [ ] **Step 6: Run the full suite and commit**

Run: `npx vitest run`
Expected: all pass.

```bash
git add .powerpages-site/server-logic/me test/server-logic/me.test.ts
git commit -m "S1-07: me Server Logic (session-scoped contact, account, roles) with harness tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Site configuration files (S1-04, S1-05)

**Files:**
- Create (by script): 4 × `.powerpages-site/web-roles/*.webrole.yml`
- Modify/create: `.powerpages-site/site-settings/*.sitesetting.yml`
- Create: `.powerpages-site/web-templates/code-site-shell-header/Code-Site-Shell-Header.webtemplate.yml` and `.webtemplate.source.html`
- Modify: `.powerpages-site/website.yml`
- Create (by script): 2 table permissions
- Create: `docs/runbooks/portal-access.md`

**Interfaces:**
- Produces: web roles named exactly `Full Access`, `Orders & Delivery`, `Finance & Documents`, `View Only` (Tasks 5, 6 and 8 look them up by name).

- [ ] **Step 1: Create the web roles**

```bash
PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6
for r in "Full Access" "Orders & Delivery" "Finance & Documents" "View Only"; do
  node "$PP/skills/create-webroles/scripts/create-web-role.js" --projectRoot . --name "$r"
done
node "$PP/skills/create-webroles/scripts/validate-webroles.js" --projectRoot .
ls .powerpages-site/web-roles
```

Expected:
- seven `.webrole.yml` files: the 3 existing plus the 4 new ones, each with `anonymoususersrole: false`, `authenticatedusersrole: false` and a unique `id`;
- the validator reports no errors.

- [ ] **Step 2: Change the existing auth settings**

```bash
cd .powerpages-site/site-settings
set_value() { sed -i "s/^value: .*/value: $2/" "$1.sitesetting.yml"; grep -H "^value" "$1.sitesetting.yml"; }
set_value Authentication-Registration-OpenRegistrationEnabled false
set_value Authentication-Registration-EmailConfirmationEnabled false
set_value Authentication-Registration-ProfileRedirectEnabled false
set_value Authentication-Registration-ExternalLoginEnabled false
set_value Authentication-Registration-AzureADLoginEnabled false
cd ../..
```

Expected: five lines, each ending `value: false`.

- [ ] **Step 3: Add the missing auth settings**

```bash
PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6
node "$PP/scripts/create-site-setting.js" --projectRoot . --name "Authentication/Registration/LocalLoginByEmail" --value true --type boolean --description "Local sign-in uses the email address (the SPA posts Email)"
node "$PP/scripts/create-site-setting.js" --projectRoot . --name "Authentication/Registration/ResetPasswordEnabled" --value true --type boolean --description "Built-in forgot-password page"
node "$PP/scripts/create-site-setting.js" --projectRoot . --name "Authentication/Registration/CaptchaEnabled" --value false --type boolean --description "SPA can't render the server CAPTCHA"
node "$PP/scripts/create-site-setting.js" --projectRoot . --name "Authentication/Registration/IsCaptchaEnabledForRegistration" --value false --type boolean --description "SPA can't render the server CAPTCHA"
grep -l "LocalLoginByEmail\|ResetPasswordEnabled\|CaptchaEnabled" .powerpages-site/site-settings/*.yml
```

Expected: four new files listed.

Also check Microsoft Learn ("Local authentication, registration, and other settings") for `Authentication/Registration/RequiresInvitation`:
- if it's documented as needed for invitation-only sign-up, add it the same way with `--value true`;
- either way, record the finding in the commit message.

- [ ] **Step 4: Port the Code-Site-Shell-Header template**

```bash
ID=$(python -c "import uuid; print(uuid.uuid4())")
mkdir -p .powerpages-site/web-templates/code-site-shell-header
cp /d/Projects/A365/PASI/POC/custom-login/.powerpages-site/web-templates/code-site-shell-header/Code-Site-Shell-Header.webtemplate.source.html .powerpages-site/web-templates/code-site-shell-header/
printf 'id: %s\nname: Code-Site-Shell-Header\n' "$ID" > .powerpages-site/web-templates/code-site-shell-header/Code-Site-Shell-Header.webtemplate.yml
sed -i "s/^headerwebtemplateid: .*/headerwebtemplateid: $ID/" .powerpages-site/website.yml
grep -n headerwebtemplateid .powerpages-site/website.yml
cat .powerpages-site/web-templates/code-site-shell-header/Code-Site-Shell-Header.webtemplate.source.html
```

Expected:
- `website.yml` shows the new id;
- the source contains the four redirects: `redeeminvitation`/`register` → `/activate/complete?code=`, `/register` → `/activate`, `/signin` → `/`.

- [ ] **Step 5: Create the table permissions**

```bash
PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6
node "$PP/scripts/create-table-permission.js" --projectRoot . --permissionName "Contact - self (read)" --tableName contact --webRoleIds b2780841-e908-44f8-b7d8-dfd367bfeeb2 --scope Self --read
node "$PP/scripts/create-table-permission.js" --projectRoot . --permissionName "Account - own account (read)" --tableName account --webRoleIds b2780841-e908-44f8-b7d8-dfd367bfeeb2 --scope Contact --contactRelationshipName contact_customer_accounts --read
node "$PP/scripts/validate-permissions-schema.js" --projectRoot . || true
git status --short .powerpages-site
```

Expected:
- two new table-permission YAML files, both read-only and assigned to Authenticated Users;
- the account one has Contact scope through `contact_customer_accounts`;
- if the validator script needs different arguments, run it with `--help` and use what it asks for.

- [ ] **Step 6: Write `docs/runbooks/portal-access.md`**

```markdown
# Portal access runbook (CHP ops)

Who can sign in to Concreat Connect, and what they see, is managed in Dataverse — never in BC (decided 2026-09-15).

## What each role sees

| Web role | Sections |
|---|---|
| Full Access | Dashboard, Delivery Sites, Orders, Customer Ledger, Document Center, Requests, Complaints & Feedback, Account and User Management |
| Orders & Delivery | Dashboard, Delivery Sites, Orders, Requests, Account and User Management |
| Finance & Documents | Dashboard, Customer Ledger, Document Center, Account and User Management |
| View Only | Dashboard, Account and User Management |

Activating a portal account gives **no** role (decision D4 default). Until a role is given, the contact sees "Your portal access is being set up".

## Give or change a role for someone who has activated

1. Open **Portal Management** → **Contacts** → find the person by email.
2. **Related** → **Web Roles** → **Add Existing Web Role** → pick one of the four roles above → **Add**.
3. To change a role, remove the old role from the same list.
4. The change applies on the person's next page load.

## Pre-grant a role (before or after the person activates)

1. Open **Concreat Connect Admin** → **Access grants** → **New**.
2. Enter the **email**, the BC **customer no.** and the **role**, then **Save**.
3. Status:
   - **Applied** — the person already had a portal account on that customer; the role is now theirs.
   - **Pending** — no portal account with that email yet; it is applied when they activate.
   - **Customer mismatch** — a portal account with that email exists on a different customer. Nothing was granted; check the email and customer no.
   - **Duplicate email** — two contacts share the email; they can't sign in until one is fixed. Ask the portal team.

## Who can use Concreat Connect Admin

CHP IT gives the staff member the **Basic User** and **Concreat Connect Admin** security roles and a Power Apps license.

## Remove access

- Remove the web role (as above), or **deactivate** the Contact to stop sign-in entirely.
- Deleting an access grant does **not** remove a role that was already applied.
```

- [ ] **Step 7: Commit**

```bash
git add .powerpages-site docs/runbooks/portal-access.md
git commit -m "S1-04/S1-05: invitation-only auth settings, shell header redirects, 4 web roles, least-privilege table permissions, ops runbook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dataverse schema (S1-02, S1-13 tables) — **APPROVAL** before Step 4

**Files:**
- Create: `scripts/dataverse/dv.py`
- Create: `scripts/dataverse/identity_schema.py`

**Interfaces:**
- Produces:
  - **Account:** columns `chp_bccustomerno`, `chp_bccompanyid`, `chp_bccompanyname`; alternate key `chp_bccustomer`.
  - **`chp_accountlink`** (set `chp_accountlinks`): lookups `chp_Contact`, `chp_Account`; key `chp_contact_account`.
  - **`chp_accessgrant`** (set `chp_accessgrants`):
    - `chp_email` (primary), `chp_bccustomerno`;
    - `chp_webrole` (choice 775000000–775000003) and `chp_status` (choice 775000000–775000003, default 775000000);
    - lookup `chp_Contact`, plus `chp_appliedon` and `chp_note`.

- [ ] **Step 1: Write `scripts/dataverse/dv.py`**

```python
"""Tiny Dataverse Web API helper for the scripts in this folder (Dev only)."""
import os
import sys

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from auth import get_token, load_env  # noqa: E402

SOLUTION = 'ConcreatHub'


class Dataverse:
    def __init__(self):
        load_env()
        self.base = os.environ['DATAVERSE_URL'].rstrip('/') + '/api/data/v9.2/'
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': 'Bearer ' + get_token(),
            'Accept': 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            'MSCRM.SolutionUniqueName': SOLUTION,  # new components land in ConcreatHub
        })
        if 'org380257ac' not in self.base:
            raise SystemExit(f'Refusing to run against {self.base}: these scripts are for Dev only.')

    def get(self, path):
        """GET; returns parsed JSON, or None on 404."""
        r = self.session.get(self.base + path)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    def post(self, path, body):
        r = self.session.post(self.base + path, json=body)
        if not r.ok:
            raise SystemExit(f'POST {path} failed {r.status_code}: {r.text}')
        return r.headers.get('OData-EntityId')

    def patch(self, path, body):
        r = self.session.patch(self.base + path, json=body)
        if not r.ok:
            raise SystemExit(f'PATCH {path} failed {r.status_code}: {r.text}')


def label(text):
    return {'@odata.type': 'Microsoft.Dynamics.CRM.Label',
            'LocalizedLabels': [{'@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', 'Label': text, 'LanguageCode': 1033}]}


def required(flag):
    return {'Value': 'ApplicationRequired' if flag else 'None', 'CanBeChanged': True,
            'ManagedPropertyLogicalName': 'canmodifyrequirementlevelsettings'}


def odata_literal(value):
    """Escape a value for an OData string literal (architecture rule 4)."""
    return value.replace("'", "''")
```

- [ ] **Step 2: Write `scripts/dataverse/identity_schema.py`**

```python
"""S1-02 / S1-13 schema in the ConcreatHub solution. Idempotent: existing parts are skipped. Dev only.

Usage: python scripts/dataverse/identity_schema.py
"""
from dv import Dataverse, label, required

dv = Dataverse()


def text(schema, display, max_length, is_required=False, primary=False):
    attr = {'@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', 'SchemaName': schema,
            'DisplayName': label(display), 'RequiredLevel': required(is_required),
            'MaxLength': max_length, 'FormatName': {'Value': 'Text'}}
    if primary:
        attr['IsPrimaryName'] = True
    return attr


def choice(schema, display, options, default=None, is_required=False):
    attr = {'@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata', 'SchemaName': schema,
            'DisplayName': label(display), 'RequiredLevel': required(is_required),
            'OptionSet': {'@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', 'IsGlobal': False,
                          'OptionSetType': 'Picklist',
                          'Options': [{'Value': v, 'Label': label(t)} for v, t in options]}}
    if default is not None:
        attr['DefaultFormValue'] = default
    return attr


def ensure_attribute(table, attr):
    logical = attr['SchemaName'].lower()
    if dv.get(f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{logical}')?$select=LogicalName"):
        print(f'  = {table}.{logical} exists')
        return
    dv.post(f"EntityDefinitions(LogicalName='{table}')/Attributes", attr)
    print(f'  + {table}.{logical}')


def ensure_table(schema, display, plural, description, primary):
    logical = schema.lower()
    if dv.get(f"EntityDefinitions(LogicalName='{logical}')?$select=LogicalName"):
        print(f'  = table {logical} exists')
        return
    dv.post('EntityDefinitions', {
        '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata', 'SchemaName': schema,
        'DisplayName': label(display), 'DisplayCollectionName': label(plural), 'Description': label(description),
        'OwnershipType': 'OrganizationOwned', 'IsActivity': False, 'HasActivities': False, 'HasNotes': False,
        'Attributes': [primary],
    })
    print(f'  + table {logical}')


def ensure_lookup(referencing, lookup_schema, display, referenced, relationship, is_required, cascade_delete):
    if dv.get(f"RelationshipDefinitions(SchemaName='{relationship}')?$select=SchemaName"):
        print(f'  = relationship {relationship} exists')
        return
    dv.post('RelationshipDefinitions', {
        '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata', 'SchemaName': relationship,
        'ReferencedEntity': referenced, 'ReferencingEntity': referencing,
        'CascadeConfiguration': {'Assign': 'NoCascade', 'Share': 'NoCascade', 'Unshare': 'NoCascade',
                                 'Reparent': 'NoCascade', 'Delete': cascade_delete, 'Merge': 'NoCascade'},
        'Lookup': {'@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata', 'SchemaName': lookup_schema,
                   'DisplayName': label(display), 'RequiredLevel': required(is_required)},
    })
    print(f'  + lookup {referencing}.{lookup_schema.lower()} ({relationship})')


def ensure_key(table, schema, display, columns):
    existing = dv.get(f"EntityDefinitions(LogicalName='{table}')/Keys?$select=SchemaName")
    if any(k['SchemaName'].lower() == schema.lower() for k in existing['value']):
        print(f'  = key {schema} exists')
        return
    dv.post(f"EntityDefinitions(LogicalName='{table}')/Keys", {
        'SchemaName': schema, 'DisplayName': label(display), 'KeyAttributes': columns})
    print(f'  + key {schema} on {table}({", ".join(columns)})')


print('Account columns')
ensure_attribute('account', text('chp_BCCustomerNo', 'BC Customer No.', 20))
ensure_attribute('account', text('chp_BCCompanyId', 'BC Company ID', 36))
ensure_attribute('account', text('chp_BCCompanyName', 'BC Company', 100))
ensure_key('account', 'chp_bccustomer', 'BC customer', ['chp_bccustomerno', 'chp_bccompanyid'])

print('Account Link')
ensure_table('chp_AccountLink', 'Account Link', 'Account Links',
             'Contact ↔ Account links (one per contact for Nov 15; Phase 2 switcher adds more).',
             text('chp_Name', 'Name', 200, is_required=True, primary=True))
ensure_lookup('chp_accountlink', 'chp_Contact', 'Contact', 'contact', 'chp_contact_chp_accountlink', True, 'Cascade')
ensure_lookup('chp_accountlink', 'chp_Account', 'Account', 'account', 'chp_account_chp_accountlink', True, 'Cascade')
ensure_key('chp_accountlink', 'chp_contact_account', 'Contact and account', ['chp_contact', 'chp_account'])

print('Access Grant')
ensure_table('chp_AccessGrant', 'Access Grant', 'Access Grants',
             'Pre-granted portal roles by email (S1-13). Applied by the "Concreat Connect – Apply access grant" flow.',
             text('chp_Email', 'Email', 100, is_required=True, primary=True))
ensure_attribute('chp_accessgrant', text('chp_BCCustomerNo', 'BC Customer No.', 20, is_required=True))
ensure_attribute('chp_accessgrant', choice('chp_WebRole', 'Role', [
    (775000000, 'Full Access'), (775000001, 'Orders & Delivery'),
    (775000002, 'Finance & Documents'), (775000003, 'View Only')], is_required=True))
ensure_attribute('chp_accessgrant', choice('chp_Status', 'Status', [
    (775000000, 'Pending'), (775000001, 'Applied'),
    (775000002, 'Customer mismatch'), (775000003, 'Duplicate email')], default=775000000))
ensure_attribute('chp_accessgrant', {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', 'SchemaName': 'chp_AppliedOn',
    'DisplayName': label('Applied on'), 'RequiredLevel': required(False), 'Format': 'DateAndTime'})
ensure_attribute('chp_accessgrant', {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', 'SchemaName': 'chp_Note',
    'DisplayName': label('Note'), 'RequiredLevel': required(False), 'MaxLength': 2000})
ensure_lookup('chp_accessgrant', 'chp_Contact', 'Applied to contact', 'contact', 'chp_contact_chp_accessgrant', False, 'RemoveLink')

print('Publishing')
dv.post('PublishXml', {'ParameterXml': '<importexportxml><entities><entity>account</entity>'
                                        '<entity>chp_accountlink</entity><entity>chp_accessgrant</entity>'
                                        '</entities></importexportxml>'})
print('Done.')
```

- [ ] **Step 3: Check the scripts compile**

Run: `python -m py_compile scripts/dataverse/dv.py scripts/dataverse/identity_schema.py && echo ok`
Expected: `ok`.

- [ ] **Step 4: APPROVAL, then run against Dev**

Ask the user: "Create the S1-02/S1-13 Dataverse schema in Dev (`ConcreatHub`) now?" Wait for an explicit yes.

Run (from the repo root, where `.env` lives): `python scripts/dataverse/identity_schema.py`
Expected: `+` lines for every column, table, lookup and key, then `Done.`

Run it **a second time**.
Expected: only `=` lines and `Done.` This is Review Focus #3.

- [ ] **Step 5: Verify**

Run:

```bash
python - <<'EOF'
import sys; sys.path.insert(0, 'scripts/dataverse')
from dv import Dataverse
dv = Dataverse()
for t in ['chp_accountlink', 'chp_accessgrant']:
    print(t, dv.get(f"EntityDefinitions(LogicalName='{t}')?$select=EntitySetName")['EntitySetName'])
print([k['SchemaName'] for k in dv.get("EntityDefinitions(LogicalName='account')/Keys?$select=SchemaName,EntityKeyIndexStatus")['value']])
comps = dv.get("solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ed4d4ea0-74bd-f111-aaad-7ced8dfe9114 and componenttype eq 1")
print('entities in ConcreatHub:', len(comps['value']))
EOF
```

Expected:
- `chp_accountlink chp_accountlinks`
- `chp_accessgrant chp_accessgrants`
- the key list includes `chp_bccustomer`
- the entity count is at least 2

- [ ] **Step 6: Commit**

```bash
git add scripts/dataverse/dv.py scripts/dataverse/identity_schema.py
git commit -m "S1-02/S1-13: idempotent Dataverse schema script (Account BC keys, chp_accountlink, chp_accessgrant)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Concreat Connect Admin — security role, form, view, app (S1-13) — **APPROVAL** before Step 3

**Files:**
- Create: `scripts/dataverse/admin_role.py`

**Interfaces:**
- Consumes: `chp_accessgrant` (Task 4).
- Produces: security role `Concreat Connect Admin`, and the model-driven app `Concreat Connect Admin` in `ConcreatHub`.

- [ ] **Step 1: Write `scripts/dataverse/admin_role.py`**

```python
"""Security role "Concreat Connect Admin" (S1-13) in ConcreatHub. Idempotent. Dev only.

Usage: python scripts/dataverse/admin_role.py
"""
from dv import SOLUTION, Dataverse

ROLE = 'Concreat Connect Admin'
# (privilege name, depth). Global = organization level.
PRIVILEGES = [
    ('prvCreatechp_accessgrant', 'Global'), ('prvReadchp_accessgrant', 'Global'),
    ('prvWritechp_accessgrant', 'Global'), ('prvDeletechp_accessgrant', 'Global'),
    ('prvAppendchp_accessgrant', 'Global'), ('prvAppendTochp_accessgrant', 'Global'),
    ('prvReadContact', 'Global'), ('prvAppendToContact', 'Global'),
]

dv = Dataverse()
root_bu = dv.get('businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null')['value'][0]['businessunitid']

existing = dv.get(f"roles?$select=roleid&$filter=name eq '{ROLE}' and _businessunitid_value eq {root_bu}")['value']
if existing:
    role_id = existing[0]['roleid']
    print(f'= role {ROLE} exists ({role_id})')
else:
    entity_id = dv.post('roles', {'name': ROLE, 'businessunitid@odata.bind': f'/businessunits({root_bu})'})
    role_id = entity_id.split('(')[-1].rstrip(')')
    print(f'+ role {ROLE} ({role_id})')

privs = []
for name, depth in PRIVILEGES:
    found = dv.get(f"privileges?$select=privilegeid&$filter=name eq '{name}'")['value']
    if not found:
        raise SystemExit(f'Privilege {name} not found — run identity_schema.py first.')
    privs.append({'PrivilegeId': found[0]['privilegeid'], 'BusinessUnitId': root_bu, 'Depth': depth})
dv.post(f'roles({role_id})/Microsoft.Dynamics.CRM.AddPrivilegesRole', {'Privileges': privs})
print(f'= {len(privs)} privileges set')

dv.post('AddSolutionComponent', {'ComponentId': role_id, 'ComponentType': 20, 'SolutionUniqueName': SOLUTION,
                                 'AddRequiredComponents': False, 'DoNotIncludeSubcomponents': False})
print(f'= role in {SOLUTION}')
```

- [ ] **Step 2: Check it compiles**

Run: `python -m py_compile scripts/dataverse/admin_role.py && echo ok`
Expected: `ok`.

- [ ] **Step 3: APPROVAL, then create the role, form, view and app in Dev**

Ask the user: "Create the Concreat Connect Admin security role, form, view and app in Dev now?" Wait for an explicit yes.

Run (from the repo root): `python scripts/dataverse/admin_role.py`
Expected: `+ role …` (or `= role …` on re-run), `= 8 privileges set`, `= role in ConcreatHub`.

Then use the **`dataverse:dv-metadata`** skill to set up the `chp_accessgrant` main form and "Active Access Grants" view:
- **Main form fields, in order:** Email, BC Customer No., Role, Status (read-only), Applied to contact (read-only), Applied on (read-only), Note.
- **View columns:** Email, BC Customer No., Role, Status, Applied on, Modified On. Sorted by Modified On, newest first.
- Publish.

Create the app in the maker portal (no API skill builds model-driven apps):
1. Open `https://make.powerapps.com` → environment *CHP Customer Portal* → **Solutions** → **ConcreatHub** → **New** → **App** → **Model-driven app**.
2. Name it **Concreat Connect Admin**, then **Create**.
3. **Add page** → **Dataverse table** → **Access Grant** → **Add**.
4. Remove any other pages.
5. **Save** → **Publish**.
6. **Share** the app with the security role **Concreat Connect Admin**.

CHP staff who use the app need the **Basic User** security role plus **Concreat Connect Admin**, and a Power Apps license. The runbook says so.

- [ ] **Step 4: Verify**

Run:

```bash
python - <<'EOF'
import sys; sys.path.insert(0, 'scripts/dataverse')
from dv import Dataverse
dv = Dataverse()
print(dv.get("roles?$select=name&$filter=name eq 'Concreat Connect Admin'")['value'])
print(dv.get("appmodules?$select=name,uniquename&$filter=name eq 'Concreat Connect Admin'")['value'])
EOF
```

Expected: one role and one app module, both named "Concreat Connect Admin".

- [ ] **Step 5: Commit**

```bash
git add scripts/dataverse/admin_role.py
git commit -m "S1-13: Concreat Connect Admin security role script; admin app created in ConcreatHub

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Grant flow (S1-13) — **APPROVAL** before Step 1

**Files:** none in git; the flow lives in `ConcreatHub`.

**Interfaces:**
- Consumes: `chp_accessgrant` (Task 4) and the four web roles (deployed in Task 7, so the flow's live test happens in Task 9).

- [ ] **Step 1: APPROVAL, then build the flow**

Ask the user: "Create the 'Concreat Connect – Apply access grant' flow in Dev (`ConcreatHub`) now?" Wait for an explicit yes.

Use the **`power-automate:build-flow`** skill, which must create a **solution-aware** flow in `ConcreatHub` with a Dataverse connection reference, using exactly this logic:

1. **Trigger:** Dataverse *When a row is added, modified or deleted*.
   - Change type: **Added or Modified**; table: **Access Grants**; scope: **Organization**.
   - **Select columns:** `chp_email,chp_bccustomerno,chp_webrole`. Status isn't listed, so the flow's own updates don't re-trigger it.
2. **List rows**, Contacts:
   - filter `emailaddress1 eq '<trigger chp_email with ' doubled>' and statecode eq 0`;
   - select `contactid,_parentcustomerid_value`; row count `2`.
3. **Condition:** number of rows = 0 → **Update** the grant: `chp_status` = 775000000 (Pending). End.
4. **Condition:** number of rows ≥ 2 → **Update** the grant: `chp_status` = 775000003 (Duplicate email). End.
5. Otherwise (one contact): **Get row** Accounts, id = the contact's `_parentcustomerid_value`, select `chp_bccustomerno`. Configure *run after* so a failure (no or non-account parent) goes to step 6's "no" branch.
6. **Condition:** the account's `chp_bccustomerno` equals the trigger's `chp_bccustomerno`:
   - **No** → **Update** the grant: `chp_status` = 775000002 (Customer mismatch). End.
   - **Yes:**
     1. **List rows** Web Roles (`mspp_webroles`) with filter `mspp_name eq '<chp_webrole formatted label>' and _mspp_websiteid_value eq f44e98b4-3da3-4f8d-8f79-fbb244454741`, top 1. The formatted label is `triggerOutputs()?['body/chp_webrole@OData.Community.Display.V1.FormattedValue']`.
     2. **Relate rows:** table Contacts, row = the contact id, relationship `powerpagecomponent_mspp_webrole_contact`, URL = `powerpagecomponents(<mspp_webroleid>)`. On "already associated" errors, continue.
     3. **Update** the grant: `chp_status` = 775000001 (Applied), `chp_Contact` = `contacts(<contactid>)`, `chp_appliedon` = `utcNow()`.
7. Name the flow **Concreat Connect – Apply access grant** and turn it on.

- [ ] **Step 2: Validate the flow's structure**

Use the power-automate plugin's `validate_flow` (or `preflight_flow`) on the created flow.
Expected: no errors, the trigger table is `chp_accessgrants`, and the flow is in solution `ConcreatHub`.

No commit is needed (no files changed). Record the flow id in the Task 9 notes.

---

### Task 7: Deploy the site to Dev (S1-04, S1-05, S1-07) — **APPROVAL** before Step 2

- [ ] **Step 1: Confirm the target**

Run: `pac auth who`
Expected: the environment URL is `https://org380257ac.crm5.dynamics.com/`. **If not, stop.**

- [ ] **Step 2: APPROVAL, then build and upload**

Ask the user: "Deploy the site (auth settings, header template, web roles, table permissions, `me`) to the private Dev site now?" Wait for an explicit yes.

Run: `npm test && npm run build && pac pages upload-code-site --rootPath .`
Expected:
- tests pass;
- the build succeeds;
- the upload finishes with no errors, including uploads of the web roles, site settings, web template, table permissions and the `me` server logic.

- [ ] **Step 3: Verify in Dataverse**

Run:

```bash
python - <<'EOF'
import sys; sys.path.insert(0, 'scripts/dataverse')
from dv import Dataverse
dv = Dataverse()
print(sorted(r['mspp_name'] for r in dv.get("mspp_webroles?$select=mspp_name&$filter=_mspp_websiteid_value eq f44e98b4-3da3-4f8d-8f79-fbb244454741")['value']))
for n in ['Authentication/Registration/OpenRegistrationEnabled', 'Authentication/Registration/LocalLoginByEmail']:
    print(n, dv.get(f"mspp_sitesettings?$select=mspp_value&$filter=mspp_name eq '{n}'")['value'])
EOF
```

Expected:
- the roles include `Finance & Documents`, `Full Access`, `Orders & Delivery`, `View Only`;
- `OpenRegistrationEnabled` = `false`;
- `LocalLoginByEmail` = `true`.

- [ ] **Step 4: Anonymous `me` is rejected**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://chp-portal-dev.powerappsportals.com/_api/serverlogics/me`
Expected: not 200. A private site answers 302/401 to unauthenticated calls; the anonymous-role check runs again in the browser in Task 9.

- [ ] **Step 5: Commit any metadata the upload rewrote**

Run: `git status --short`. If `.powerpages-site` files changed (ids written back by `pac`), commit them:

```bash
git add .powerpages-site
git commit -m "S1-04/05/07: site metadata after first deploy to Dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Seed the Dev test users — **APPROVAL** before Step 3

**Files:**
- Create: `scripts/dataverse/seed_dev_test_users.py`

**Interfaces:**
- Consumes:
  - from Task 4: Account columns and key, `chp_accountlinks`;
  - from Task 7: the web roles, by name.

- [ ] **Step 1: Write `scripts/dataverse/seed_dev_test_users.py`**

```python
"""Dev test data for sub-project B: 1 Account, 5 Contacts, Account Links, web roles, single-use invitations.
Idempotent: re-running reuses rows and only issues a new invitation when the old one is used or expired.

Usage: python scripts/dataverse/seed_dev_test_users.py
"""
import secrets
from datetime import datetime, timedelta, timezone

from dv import Dataverse, odata_literal

SITE_ID = 'f44e98b4-3da3-4f8d-8f79-fbb244454741'
SITE_URL = 'https://chp-portal-dev.powerappsportals.com'
CUSTOMER = {'no': '10482', 'name': 'J.D. Santos Hardware & Construction Supply', 'company': 'Solid Cement'}
USERS = [
    ('full@example.com', 'Test Full Access', 'Full Access'),
    ('orders@example.com', 'Test Orders', 'Orders & Delivery'),
    ('finance@example.com', 'Test Finance', 'Finance & Documents'),
    ('viewonly@example.com', 'Test View Only', 'View Only'),
    ('norole@example.com', 'Test No Role', None),
]

dv = Dataverse()

# BC company id comes from the environment variable, never hardcoded.
definition = dv.get("environmentvariabledefinitions?$select=defaultvalue&$filter=schemaname eq 'chp_BCSolidCementCompanyId'"
                    "&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)")['value'][0]
values = definition['environmentvariabledefinition_environmentvariablevalue']
company_id = values[0]['value'] if values else definition['defaultvalue']

roles = {r['mspp_name']: r['mspp_webroleid'] for r in dv.get(
    f"mspp_webroles?$select=mspp_name&$filter=_mspp_websiteid_value eq {SITE_ID}")['value']}
missing = {r for _, _, r in USERS if r} - roles.keys()
if missing:
    raise SystemExit(f'Web roles not deployed yet: {sorted(missing)} — run Task 7 first.')

# Account: upsert through the alternate key so it exists exactly once.
key = f"chp_bccustomerno='{CUSTOMER['no']}',chp_bccompanyid='{odata_literal(company_id)}'"
dv.patch(f'accounts({key})', {'name': CUSTOMER['name'], 'chp_bccompanyname': CUSTOMER['company']})
account_id = dv.get(f'accounts({key})?$select=accountid')['accountid']
print(f"Account {CUSTOMER['no']} · {CUSTOMER['name']} ({account_id})")

now = datetime.now(timezone.utc)
for email, last_name, role in USERS:
    found = dv.get(f"contacts?$select=contactid&$filter=emailaddress1 eq '{odata_literal(email)}'")['value']
    if len(found) > 1:
        raise SystemExit(f'{email} is on {len(found)} contacts — fix before continuing (Power Pages blocks duplicate emails).')
    body = {'lastname': last_name, 'emailaddress1': email, 'parentcustomerid_account@odata.bind': f'/accounts({account_id})',
            'rpn_quickbooksid': '', 'rpn_vendordisplayname': ''}  # Dev-only required columns from another project
    if found:
        contact_id = found[0]['contactid']
        dv.patch(f'contacts({contact_id})', {'parentcustomerid_account@odata.bind': f'/accounts({account_id})'})
    else:
        contact_id = dv.post('contacts', body).split('(')[-1].rstrip(')')

    link_filter = f'_chp_contact_value eq {contact_id} and _chp_account_value eq {account_id}'
    if not dv.get(f'chp_accountlinks?$select=chp_accountlinkid&$filter={link_filter}')['value']:
        dv.post('chp_accountlinks', {'chp_name': f"{CUSTOMER['no']} · {last_name}",
                                     'chp_Contact@odata.bind': f'/contacts({contact_id})',
                                     'chp_Account@odata.bind': f'/accounts({account_id})'})

    if role:
        current = dv.get(f'contacts({contact_id})/powerpagecomponent_mspp_webrole_contact?$select=powerpagecomponentid')['value']
        if roles[role] not in {c['powerpagecomponentid'] for c in current}:
            dv.post(f'contacts({contact_id})/powerpagecomponent_mspp_webrole_contact/$ref',
                    {'@odata.id': f"{dv.base}powerpagecomponents({roles[role]})"})

    open_invites = dv.get(
        f"adx_invitations?$select=adx_invitationcode,adx_expirydate,adx_redemptions&$filter=_adx_invitecontact_value eq {contact_id}"
        f" and (adx_redemptions eq null or adx_redemptions eq 0) and adx_expirydate gt {now.strftime('%Y-%m-%dT%H:%M:%SZ')}")['value']
    if open_invites:
        code = open_invites[0]['adx_invitationcode']
    else:
        code = secrets.token_hex(16)
        dv.post('adx_invitations', {
            'adx_name': f'Dev test invitation – {email}', 'adx_type': 756150000, 'adx_invitationcode': code,
            'adx_maximumredemptions': 1, 'adx_expirydate': (now + timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'adx_inviteContact@odata.bind': f'/contacts({contact_id})',
            'mspp_websiteid@odata.bind': f'/powerpagesites({SITE_ID})'})
    print(f"{email:24} {role or '(no role)':22} {SITE_URL}/activate/complete?code={code}")
```

- [ ] **Step 2: Check it compiles**

Run: `python -m py_compile scripts/dataverse/seed_dev_test_users.py && echo ok`
Expected: `ok`.

- [ ] **Step 3: APPROVAL, then seed**

Ask the user: "Create the Dev test Account, 5 test contacts, roles and invitations now?" Wait for an explicit yes.

Run (from the repo root): `python scripts/dataverse/seed_dev_test_users.py`
Expected: an `Account 10482 …` line (if the PATCH fails because the `chp_bccustomer` key isn't active yet, wait a minute and re-run — key indexes build asynchronously), then five lines of `email  role  https://chp-portal-dev.powerappsportals.com/activate/complete?code=<32 hex>`.

Run it **again**.
Expected:
- the same five links, with the same codes because the invitations are still unredeemed;
- no errors;
- `contacts?$filter=emailaddress1 eq 'full@example.com'` returns exactly 1 row (Review Focus #3).

Give the five links to the user.

- [ ] **Step 4: Commit**

```bash
git add scripts/dataverse/seed_dev_test_users.py
git commit -m "S1-02/S1-05: idempotent Dev test-user seed (account, contacts, links, roles, invitations)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Live acceptance on Dev, and closing out

Run these in a browser signed in to the org (the site is private), using Playwright MCP or by hand with the user. Record each result.

- [ ] **Step 1: Redeem and sign in.** For each of the 5 links:
  1. Open the link → Set password screen → email from the table, password `Concreat#2026dev` (meets the policy) → **Activate account**.
  2. Expected: you land on `/`, signed in.
     - **full@:** 8 sections.
     - **orders@:** Dashboard, Delivery Sites, Orders, Requests, Account and User Management.
     - **finance@:** Dashboard, Customer Ledger, Document Center, Account and User Management.
     - **viewonly@:** Dashboard, Account and User Management.
     - **norole@:** "Your portal access is being set up".
  3. The topbar reads "Viewing **Solid Cement** · J.D. Santos Hardware & Construction Supply" (everyone except norole@).
  4. Sign out, then sign in again with email and password. Same result.
- [ ] **Step 2: Redirects.** Visiting `/SignIn` ends on `/`, and `/register` ends on `/activate`.
- [ ] **Step 3: Anonymous `me`.** Signed out, in the browser console:
  ```js
  fetch('/_api/serverlogics/me', { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(r => r.status)
  ```
  Expected: not 200, or an envelope with `Success: false`.
- [ ] **Step 4: `me` contract.** Signed in as full@, in the console:
  ```js
  fetch('/_layout/tokenhtml').then(r=>r.text()).then(t=>fetch('/_api/serverlogics/me',{headers:{__RequestVerificationToken:t.match(/value="([^"]+)"/)[1],'X-Requested-With':'XMLHttpRequest'}})).then(r=>r.json()).then(console.log)
  ```
  Expected: `Success: true` and `Data` is a JSON string with `contact`, `account.customerNo === '10482'` and a `roles` list that includes `Full Access`.
  - Note whether `Error` is `null` on success.
  - If the envelope differs from what `src/api/serverLogic.ts` expects, stop and fix it with a test first.
- [ ] **Step 5: No self-registration.** Signed out, open `/Account/Login/Register`. Expected: no registration form; the shell header sends you to `/activate`.
- [ ] **Step 6: Used link.** Open full@'s link again.
  1. Expected: the "This link has expired" card.
  2. If instead you get a generic error, capture the real HTML with:
     ```js
     fetch('/Account/Login/Register?invitationCode=<used code>&returnUrl=/').then(r=>r.text())
     ```
  3. Add a test to `src/auth/session.test.ts` that uses this HTML (fails first). Map it to `InvalidInvitationError` in `redeemInvitation` and commit. This closes A's final-review item #3.
- [ ] **Step 7: Grants** (Review Focus #4). In Concreat Connect Admin, create:
  1. `norole@example.com`, `10482`, Full Access. Expected: status **Applied** within about a minute, and norole@ now sees all 8 sections after a reload.
  2. `viewonly@example.com`, `99999`, Full Access. Expected: **Customer mismatch**, and viewonly@ still sees only Dashboard + Account.
  3. `nobody@example.com`, `10482`, Full Access. Expected: **Pending**.
- [ ] **Step 8: Close out.** Update `docs/Concreat_Hub_Implementation_Plan.md`:
  - set S1-02, S1-04, S1-05, S1-07 and S1-13 to `✅ Done (Dev)`;
  - in Notes, record: test data via `seed_dev_test_users.py`; flow id; the `AzureADLoginEnabled` outcome (did the private site still open?); the `me` envelope shape seen; the used-link result.

  Run `npm test`, `npm run lint`, `npm run build` and `git diff --check`, then commit:

```bash
git add docs/Concreat_Hub_Implementation_Plan.md
git commit -m "S1-02/04/05/07/13: Dev acceptance results; status Done (Dev)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
