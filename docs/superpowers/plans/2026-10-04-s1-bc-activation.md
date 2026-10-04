# S1 BC Helper Template and Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Server Logic calls BC as the portal app, scoped to the signed-in customer. The `company` endpoint proves it.
- A Solid Cement contact can activate a portal account from the site: a unique match gets a single-use invitation email, a duplicate email (Q10) is blocked, and Pending grants are applied.

**Architecture:**
- **Shared helpers:** live in `server-logic-src/bc-helpers.js`. A Node script copies them into each Server Logic endpoint between region markers; a Vitest test keeps the copies identical.
- **Endpoint:** `company` uses the helpers (client-credentials token → BC `mcrmCustomers`, scoped by the session's Account).
- **Activation:** a solution-aware Power Automate flow, triggered anonymously from the site. It does the BC lookups and all Dataverse writes under its own connections, then emails the invitation.
- **Configuration:** Dataverse environment variables. The BC client secret is a plain-text variable (Dev-only exception).

**Tech Stack:** Power Pages Server Logic (server-side JavaScript), Node 20+ ESM script, Vitest, Python 3.12 + Dataverse Web API (`scripts/dataverse/dv.py`), Power Automate (Dataverse, Outlook and HTTP), PAC CLI.

**Spec:** `docs/superpowers/specs/2026-10-04-s1-bc-activation-design.md`

## Global Constraints

- **Dev only:**
  - Dataverse `https://org380257ac.crm5.dynamics.com/`, site `https://chp-portal-dev.powerappsportals.com` (private), Power Pages site id `f44e98b4-3da3-4f8d-8f79-fbb244454741`.
  - BC environment **`DEV`**, Solid Cement company `d2e4496e-be79-f111-8070-6045bd2058e3`.
  - Never BC production, UAT or Prod.
- **APPROVAL steps:** every step marked **APPROVAL** changes Dev. Stop and get the user's explicit yes first.
- **Secrets:**
  - The BC client secret and client ID are typed by the **user** into the maker portal.
  - They never appear in chat, a file, a commit, a command line, a log or a test.
  - Scripts print only "set" or "empty" for them.
  - `chp_BCClientSecret` has **no default value**.
- **Scope:** Server Logic takes the customer and company only from the session's Account; it never reads ids from `Server.Context`. Every OData value goes through `odataLiteral` (quotes doubled) and every query string through `odataQuery` (`encodeURIComponent`).
- **Server Logic code rules:**
  - Only top-level `get`/`post`/`put`/`patch`/`del`.
  - No `require`/`import`, `eval`, `setTimeout`, `delete`, `prototype`, `Reflect.`, `console.log`, `with(`.
  - No `Function\s*\(` (case-insensitive), so no anonymous `function (…)` callbacks: **use arrow functions**, and don't write the pattern in comments either.
  - Dataverse connector calls are synchronous; `HttpClient` calls are `await`ed.
- **Live runtime facts (Dev, 2026-10-04):**
  - The Server Logic envelope is camelCase `{ success, data, error }`.
  - A thrown error becomes a generic 400.
  - `Server.User.Roles` is the text "System.String[]".
  - BC `$filter` text comparisons are case-sensitive; `tolower(eMail) eq '…'` works.
  - BC answers a misleading 401 to a badly encoded query.
- **BC DEV API:**
  - Base `https://api.businesscentral.dynamics.com/v2.0/{tenant}/DEV/api/pasi/mcrm/v1.0/companies({companyId})/`.
  - `MCRMContacts` (`no`, `type`, `companyNo`, `eMail`, `name`).
  - `mcrmBusinessRelation` (`contactNo`, `linktoTable` = `'Customer'`, **`vendorNo` = customer no.**).
  - `mcrmCustomers` (`Customer_No`, `Name`, `Address`, `Address_2`, `City`, `County`, `Post_Code`, `VATRegNo`, `Phone_No`, `EMail`).
- **Web role ids (Dev):**

  | Role | Id |
  |---|---|
  | Anonymous Users | `24d62544-a66e-4660-81a6-ee467b783abb` |
  | Full Access | `56b29291-b981-4ef0-865b-41c1e9523a97` |
  | Orders & Delivery | `11bb7218-55fb-4cae-b8a1-5af2f41237c5` |
  | Finance & Documents | `c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3` |
  | View Only | `0c42c9f3-bc20-40a2-8c6a-a731a263ed83` |

- **Deploy:** only `pac pages upload-code-site --rootPath .`, after `pac org who` shows `org380257ac`.
- **Plugin scripts:** `PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6`.
  - Git Bash rewrites arguments that start with `/`, so run commands whose arguments start with `/` with `MSYS_NO_PATHCONV=1`.
- **Commits:** cite S1-06 / S1-03 and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The helper block is identical** in every endpoint after any edit. A hand-edited copy, or a forgotten stamp run, must fail the suite (Task 2 test).
2. **A customer no. containing `'` or spaces** must be escaped and URL-encoded, so a crafted Account value can't change the BC query (Task 3 test).
3. **Request parameters are ignored.** A caller passing `customerNo`/`companyId` in the query or body must still get only their session customer (Task 3 test).
4. **An activation email in mixed case** (`Mi…@Automations365.COM`) must still match BC and Dataverse (Task 7 live check 2b, plus the definition test that the filter uses `tolower`).
5. **Re-running activation** for the same address must not create a second contact, account or link, and must not send another invitation once the account is active (Task 7 live check 5).

---

### Task 1: Configuration — environment variables, site settings, recorded exception

**Files:**
- Create: `scripts/dataverse/env_vars.py`
- Create (by plugin script): 5 × `.powerpages-site/site-settings/BC-*.sitesetting.yml`
- Modify: `CLAUDE.md`, `docs/Concreat_Hub_Architecture.md`, `docs/Concreat_Hub_Implementation_Plan.md` (S1-14)

**Interfaces:**
- **Produces:**
  - Environment variables: `chp_BCClientId`, `chp_BCClientSecret`, `chp_PowerPagesSiteId` (new); `chp_BCEnvironmentName` = `DEV`, `chp_BCSolidCementCompanyId` = `d2e4…`, `chp_SenderMailbox` (values).
  - Site settings `BC/TenantId`, `BC/EnvironmentName`, `BC/ApiBasePath`, `BC/ClientId`, `BC/ClientSecret`, each linked to its variable.

- [ ] **Step 1: Write `scripts/dataverse/env_vars.py`**

```python
"""Dev environment variables for sub-project C (S1-03 / S1-06). Idempotent. Dev only.

chp_BCClientId and chp_BCClientSecret are created EMPTY on purpose: the developer types their values in
make.powerapps.com → Solutions → ConcreatHub → Environment variables. They are never passed to this script,
never printed, never committed.

Usage (from the repo root): python scripts/dataverse/env_vars.py --sender <developer mailbox>
"""
import argparse

from dv import Dataverse

STRING = 100000000  # environmentvariabledefinition.type: String
SECRET_LIKE = {'chp_BCClientId', 'chp_BCClientSecret'}

parser = argparse.ArgumentParser()
parser.add_argument('--sender', required=True, help='mailbox that sends activation emails and ops notices (Dev)')
args = parser.parse_args()

dv = Dataverse()

# Existing definitions whose Dev value changes (BC environment renamed TRAINING → DEV, 2026-10-04).
VALUES = {
    'chp_BCEnvironmentName': 'DEV',
    'chp_BCSolidCementCompanyId': 'd2e4496e-be79-f111-8070-6045bd2058e3',
    'chp_SenderMailbox': args.sender,
    'chp_PowerPagesSiteId': 'f44e98b4-3da3-4f8d-8f79-fbb244454741',
}
# New definitions: (schema name, display name). Values: only chp_PowerPagesSiteId above; the two BC ones by hand.
NEW = [
    ('chp_BCClientId', 'BC Client ID'),
    ('chp_BCClientSecret', 'BC Client Secret (Dev: plain text, no default; Key Vault before UAT, S1-14)'),
    ('chp_PowerPagesSiteId', 'Power Pages Site ID'),
]


def definition_id(schema):
    rows = dv.get(f"environmentvariabledefinitions?$select=environmentvariabledefinitionid&$filter=schemaname eq '{schema}'")['value']
    return rows[0]['environmentvariabledefinitionid'] if rows else None


for schema, display in NEW:
    if definition_id(schema):
        print(f'= {schema} exists')
    else:
        dv.post('environmentvariabledefinitions', {'schemaname': schema, 'displayname': display, 'type': STRING})
        print(f'+ {schema}')

for schema, value in VALUES.items():
    def_id = definition_id(schema)
    rows = dv.get(f"environmentvariablevalues?$select=environmentvariablevalueid&$filter=_environmentvariabledefinitionid_value eq {def_id}")['value']
    if rows:
        dv.patch(f"environmentvariablevalues({rows[0]['environmentvariablevalueid']})", {'value': value})
    else:
        dv.post('environmentvariablevalues', {'schemaname': schema, 'value': value,
                                              'EnvironmentVariableDefinitionId@odata.bind': f'/environmentvariabledefinitions({def_id})'})
    print(f'= {schema} = {value}')

for schema in sorted(SECRET_LIKE):
    def_id = definition_id(schema)
    rows = dv.get(f"environmentvariablevalues?$select=value&$filter=_environmentvariabledefinitionid_value eq {def_id}")['value']
    print(f"= {schema}: {'set' if rows and rows[0].get('value') else 'EMPTY — set it in the maker portal'}")
```

- [ ] **Step 2: Compile**

Run: `python -m py_compile scripts/dataverse/env_vars.py && rm -rf scripts/dataverse/__pycache__ && echo ok`
Expected: `ok`.

- [ ] **Step 3: APPROVAL, then apply**

Ask: "Update the Dev environment variables now (BC env → DEV, Solid Cement company id → DEV id, sender = <mailbox>, and create empty chp_BCClientId / chp_BCClientSecret plus chp_PowerPagesSiteId)?" Confirm the sender address with the user in the same question.

Run: `python scripts/dataverse/env_vars.py --sender <confirmed mailbox>`
Expected: `+`/`=` lines, then `chp_BCClientId: EMPTY …` and `chp_BCClientSecret: EMPTY …`.

Run it **again**.
Expected: only `=` lines, with no errors.

- [ ] **Step 4: The user sets the two BC values**

Tell the user:

> In make.powerapps.com → CHP Customer Portal → Solutions → ConcreatHub → Environment variables:
> - open **BC Client ID** → **New value** → paste the client ID → Save;
> - open **BC Client Secret** → **New value** → paste the secret → Save. Leave **Default value** empty.
>
> Reply "values set". Please don't paste either value here.

Then run `python scripts/dataverse/env_vars.py --sender <same mailbox>`.
Expected: both lines read `set`.

- [ ] **Step 5: Linked site settings**

```bash
PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6
for pair in "BC/TenantId:chp_BCTenantId" "BC/EnvironmentName:chp_BCEnvironmentName" "BC/ApiBasePath:chp_BCApiBasePath" "BC/ClientId:chp_BCClientId" "BC/ClientSecret:chp_BCClientSecret"; do
  MSYS_NO_PATHCONV=1 node "$PP/scripts/create-site-setting.js" --projectRoot . --name "${pair%%:*}" --envVarSchema "${pair##*:}"; echo
done
grep -l "BC/" .powerpages-site/site-settings/*.yml | xargs -I{} sh -c 'echo "== {}"; cat "{}"'
```

Expected: 5 YAML files, each naming its `chp_…` variable and **containing no value**.

- [ ] **Step 6: Record the Dev-only secret exception**

In `CLAUDE.md`, after the line that starts `- **All environment-specific values are Dataverse environment variables**`, add:

```markdown
  - **Exception (Dev only, decided 2026-10-04):** `chp_BCClientSecret` is a plain-text environment variable (no default value, value set by hand in Dev only) instead of Key Vault. Moving it to Key Vault is part of S1-14 and must happen before UAT. Never put its value in chat, files or git.
```

In `docs/Concreat_Hub_Architecture.md` §4 "Secrets and BC access", append:

```markdown
- **Dev exception (2026-10-04):** the BC client secret is a plain-text environment variable with no default value, set by hand in Dev only. Key Vault is required before UAT (plan task S1-14).
```

In `docs/Concreat_Hub_Implementation_Plan.md`, in the S1-14 row's task text, after `**UAT readiness for S1 identity/grants**:` insert `move chp_BCClientSecret to a Key Vault-backed secret environment variable;`.

- [ ] **Step 7: Commit**

```bash
git add scripts/dataverse/env_vars.py .powerpages-site/site-settings CLAUDE.md docs/Concreat_Hub_Architecture.md docs/Concreat_Hub_Implementation_Plan.md
git commit -m "S1-06: BC environment variables (DEV), linked BC/* site settings, Dev-only plain-text secret exception

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared BC helpers and the stamper

**Files:**
- Create: `server-logic-src/bc-helpers.js`
- Create: `scripts/stamp-server-logic-helpers.mjs`
- Test: `test/server-logic/bc-helpers.test.ts`

**Interfaces:**
- **Produces** (available inside any verb function that holds the region):
  - `parseResult(result)`
  - `bcConfig()` → `{ tenantId, environment, basePath, clientId, clientSecret }`
  - `sessionScope()` → `{ contactId, customerNo, companyId, customerName }`
  - `odataLiteral(value)` → `'…'`
  - `odataQuery(params)` → `"$filter=…&$select=…"` (values URL-encoded)
  - `async bcToken(cfg)` → access token, cached per invocation
  - `async bcGet(scope, entity, query)` → parsed body
  - `async bcPost(scope, entity, body)` → parsed body
  - `async respond(work)` → JSON string, or throws `Error("We couldn't load this information. Please try again.")`
- **Stamper exports:** `START`, `END`, `stampText(text, source)` → stamped text, `isStamped(text, source)` → boolean.
  - CLI: `node scripts/stamp-server-logic-helpers.mjs [--check]`.

- [ ] **Step 1: Write the failing test** — `test/server-logic/bc-helpers.test.ts`

```ts
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { START, END, isStamped, stampText } from '../../scripts/stamp-server-logic-helpers.mjs'

const source = readFileSync(resolve('server-logic-src/bc-helpers.js'), 'utf8')
const dir = resolve('.powerpages-site/server-logic')
const endpointFiles = readdirSync(dir)
  .map((name) => join(dir, name, `${name}.js`))
  .filter((file) => existsSync(file) && readFileSync(file, 'utf8').includes(START))

test('stampText fills the region with the source, indented like the marker, and is stable', () => {
  const file = `async function get() {\n    ${START}\n    old\n    ${END}\n    return 1;\n}\n`
  const once = stampText(file, 'function a() {\n    return 1;\n}\n')
  expect(once).toBe(`async function get() {\n    ${START}\n    function a() {\n        return 1;\n    }\n    ${END}\n    return 1;\n}\n`)
  expect(stampText(once, 'function a() {\n    return 1;\n}\n')).toBe(once)
  expect(isStamped(once, 'function a() {\n    return 1;\n}\n')).toBe(true)
  expect(isStamped(file, 'function a() {\n    return 1;\n}\n')).toBe(false)
})

test('every endpoint that uses the BC helpers carries an identical copy', () => {
  expect(endpointFiles.length).toBeGreaterThan(0)
  for (const file of endpointFiles) {
    expect(isStamped(readFileSync(file, 'utf8'), source), `${file} is out of date: run node scripts/stamp-server-logic-helpers.mjs`).toBe(true)
  }
})

test('the helper source avoids every pattern the Power Pages validator rejects', () => {
  for (const pattern of [/\brequire\(/, /\bimport\b/, /\beval\(/, /setTimeout/, /\bdelete\b/, /prototype/, /Reflect\./, /console\.log/, /with\(/, /Function\s*\(/i]) {
    expect(source).not.toMatch(pattern)
  }
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/server-logic/bc-helpers.test.ts`
Expected: FAIL. It can't resolve `server-logic-src/bc-helpers.js` or the stamper module.

- [ ] **Step 3: Write `server-logic-src/bc-helpers.js`**

```js
// Shared BC helpers (S1-06). Server Logic has no module loading, so scripts/stamp-server-logic-helpers.mjs copies this
// block into every endpoint between the bc-helpers region markers. Edit here, then run the stamper.
// Rules: arrow callbacks only; HttpClient calls are awaited; Dataverse calls are synchronous.

var bcTokenCache = null;

// HttpClient and connector results arrive as the record, a JSON string, or a { StatusCode, Body } envelope.
function parseResult(result) {
    var value = typeof result === "string" ? JSON.parse(result) : result;
    if (value && (value.IsSuccessStatusCode === false || (typeof value.StatusCode === "number" && value.StatusCode >= 400))) {
        throw new Error("bc-" + value.StatusCode + " " + (value.ReasonPhrase || ""));
    }
    if (value && typeof value.Body === "string") {
        value = value.Body ? JSON.parse(value.Body) : {};
    }
    return value;
}

function bcConfig() {
    var names = { tenantId: "BC/TenantId", environment: "BC/EnvironmentName", basePath: "BC/ApiBasePath", clientId: "BC/ClientId", clientSecret: "BC/ClientSecret" };
    var cfg = {};
    Object.keys(names).forEach((key) => {
        var value = Server.Sitesetting.Get(names[key]);
        if (!value || !String(value).trim()) {
            throw new Error("bc-config " + names[key] + " is not set");
        }
        cfg[key] = String(value).trim();
    });
    return cfg;
}

// Customer and company come only from the signed-in contact's Account (architecture rule 3).
function sessionScope() {
    var user = Server.User;
    if (!user || !user.contactid) {
        throw new Error("not-signed-in");
    }
    var contact = parseResult(
        Server.Connector.Dataverse.RetrieveRecord(
            "contacts",
            user.contactid,
            "$select=contactid&$expand=parentcustomerid_account($select=name,chp_bccustomerno,chp_bccompanyid)"
        )
    );
    var account = contact.parentcustomerid_account;
    if (!account || !account.chp_bccustomerno || !account.chp_bccompanyid) {
        throw new Error("no-account");
    }
    return { contactId: user.contactid, customerNo: account.chp_bccustomerno, companyId: account.chp_bccompanyid, customerName: account.name || "" };
}

// OData string literal with single quotes doubled (architecture rule 4).
function odataLiteral(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
}

// Query string with every value URL-encoded; BC answers a misleading 401 to a badly encoded query.
function odataQuery(params) {
    return Object.keys(params)
        .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
        .map((key) => key + "=" + encodeURIComponent(String(params[key])))
        .join("&");
}

async function bcToken(cfg) {
    if (bcTokenCache) {
        return bcTokenCache;
    }
    var form = [
        ["grant_type", "client_credentials"],
        ["client_id", cfg.clientId],
        ["client_secret", cfg.clientSecret],
        ["scope", "https://api.businesscentral.dynamics.com/.default"]
    ]
        .map((pair) => pair[0] + "=" + encodeURIComponent(pair[1]))
        .join("&");
    var response = parseResult(
        await Server.Connector.HttpClient.PostAsync(
            "https://login.microsoftonline.com/" + cfg.tenantId + "/oauth2/v2.0/token",
            form,
            {},
            "application/x-www-form-urlencoded"
        )
    );
    if (!response || !response.access_token) {
        throw new Error("bc-auth no access_token");
    }
    bcTokenCache = response.access_token;
    return bcTokenCache;
}

function bcUrl(cfg, scope, entity, query) {
    return "https://api.businesscentral.dynamics.com/v2.0/" + cfg.tenantId + "/" + cfg.environment + cfg.basePath +
        "/companies(" + scope.companyId + ")/" + entity + (query ? "?" + query : "");
}

async function bcGet(scope, entity, query) {
    var cfg = bcConfig();
    var token = await bcToken(cfg);
    return parseResult(
        await Server.Connector.HttpClient.GetAsync(bcUrl(cfg, scope, entity, query), { Authorization: "Bearer " + token, Accept: "application/json" })
    );
}

async function bcPost(scope, entity, body) {
    var cfg = bcConfig();
    var token = await bcToken(cfg);
    return parseResult(
        await Server.Connector.HttpClient.PostAsync(
            bcUrl(cfg, scope, entity, ""),
            JSON.stringify(body),
            { Authorization: "Bearer " + token, Accept: "application/json" },
            "application/json"
        )
    );
}

// Runs the endpoint body; customers only ever see a safe message, the detail goes to the log.
async function respond(work) {
    try {
        return JSON.stringify(await work());
    } catch (err) {
        Server.Logger.Error(Server.Context.ServerLogicName + " failed: " + err.message);
        throw new Error("We couldn't load this information. Please try again.");
    }
}
```

- [ ] **Step 4: Write `scripts/stamp-server-logic-helpers.mjs`**

```js
// Copies server-logic-src/bc-helpers.js into every Server Logic endpoint between the bc-helpers markers.
// Usage: node scripts/stamp-server-logic-helpers.mjs [--check]   (--check: exit 1 if any copy is out of date)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const START = '// #region bc-helpers (generated from server-logic-src/bc-helpers.js — do not edit)'
export const END = '// #endregion bc-helpers'
const REGION = /^([ \t]*)\/\/ #region bc-helpers[^\n]*\n[\s\S]*?^[ \t]*\/\/ #endregion bc-helpers/gm

const lf = (text) => text.replace(/\r\n/g, '\n')

export function stampText(text, source) {
  const body = lf(source).trimEnd().split('\n')
  return lf(text).replace(REGION, (_match, indent) => {
    const indented = body.map((line) => (line ? indent + line : line)).join('\n')
    return `${indent}${START}\n${indented}\n${indent}${END}`
  })
}

export function isStamped(text, source) {
  return stampText(text, source) === lf(text)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const source = readFileSync(join(root, 'server-logic-src', 'bc-helpers.js'), 'utf8')
  const dir = join(root, '.powerpages-site', 'server-logic')
  const check = process.argv.includes('--check')
  let stale = 0
  for (const name of readdirSync(dir)) {
    const file = join(dir, name, `${name}.js`)
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    if (!text.includes(START)) continue
    if (isStamped(text, source)) continue
    if (check) {
      console.error(`out of date: ${file}`)
      stale++
    } else {
      writeFileSync(file, stampText(text, source))
      console.log(`stamped: ${file}`)
    }
  }
  if (stale) process.exit(1)
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/server-logic/bc-helpers.test.ts`
Expected: tests 1 and 3 PASS. Test 2 FAILS on `expect(endpointFiles.length).toBeGreaterThan(0)`, because no endpoint uses the helpers yet. Task 3 adds `company`.

Don't commit yet. Go straight to Task 3, which commits both tasks together (Task 3 Step 7).

---

### Task 3: `company` endpoint and app types

**Files:**
- Create: `.powerpages-site/server-logic/company/company.js`
- Create (by plugin script): `.powerpages-site/server-logic/company/company.serverlogic.yml`
- Test: `test/server-logic/company.test.ts`
- Modify: `src/api/types.ts`, `src/mocks/index.ts`, `src/api/serverLogic.test.ts`

**Interfaces:**
- **Consumes:** the helpers (Task 2).
- **Produces:**
  - `GET /_api/serverlogics/company` → `CompanyDto { customerNo, customerName, address, vatRegNumber, phone, email }`;
  - the app type `CompanyDto` and the dev mock `company`.

- [ ] **Step 1: Write the failing test** — `test/server-logic/company.test.ts`

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('.powerpages-site/server-logic/company/company.js'), 'utf8')
const load = (server: unknown): { get: () => Promise<string> } => new Function('Server', `${source}\nreturn { get }`)(server)

const SETTINGS: Record<string, string> = {
  'BC/TenantId': 'tenant-1',
  'BC/EnvironmentName': 'DEV',
  'BC/ApiBasePath': '/api/pasi/mcrm/v1.0',
  'BC/ClientId': 'client-1',
  'BC/ClientSecret': 's&x=1',
}
const ROW = {
  Customer_No: 'C00000009', Name: 'BESTRADE COMMODITY SALES CORP.', Address: '12 Main St', Address_2: '', City: 'Pasig',
  County: 'NCR', Post_Code: '1600', VATRegNo: '123-456', Phone_No: '0917', EMail: 'ops@bestrade.ph',
}

function fakeServer({
  user = { contactid: 'c-1' } as unknown,
  account = { name: 'BESTRADE COMMODITY SALES CORP.', chp_bccustomerno: 'C00000009', chp_bccompanyid: 'co-1' } as unknown,
  rows = [ROW] as unknown[],
  tokenStatus = 200,
  settings = SETTINGS,
  context = { ServerLogicName: 'company', QueryParameters: {}, Body: '' } as unknown,
} = {}) {
  const http: { method: string; url: string; body?: string; headers?: unknown; contentType?: string }[] = []
  const server = {
    User: user,
    Context: context,
    Sitesetting: { Get: (name: string) => settings[name] },
    Logger: { Log() {}, Error() {}, Warn() {} },
    Connector: {
      Dataverse: { RetrieveRecord: () => ({ contactid: 'c-1', parentcustomerid_account: account }) },
      HttpClient: {
        PostAsync: async (url: string, body: string, headers: unknown, contentType: string) => {
          http.push({ method: 'POST', url, body, headers, contentType })
          return JSON.stringify({ StatusCode: tokenStatus, IsSuccessStatusCode: tokenStatus < 400, Body: JSON.stringify({ access_token: 'tok-1' }) })
        },
        GetAsync: async (url: string, headers: unknown) => {
          http.push({ method: 'GET', url, headers })
          return JSON.stringify({ StatusCode: 200, IsSuccessStatusCode: true, Body: JSON.stringify({ value: rows }) })
        },
      },
    },
  }
  return { server, http }
}

const SAFE = "We couldn't load this information. Please try again."

test("returns the signed-in customer's BC card in the wireframe's field names", async () => {
  const { server } = fakeServer()
  expect(JSON.parse(await load(server).get())).toEqual({
    customerNo: 'C00000009',
    customerName: 'BESTRADE COMMODITY SALES CORP.',
    address: '12 Main St, Pasig, NCR, 1600',
    vatRegNumber: '123-456',
    phone: '0917',
    email: 'ops@bestrade.ph',
  })
})

test('gets a client-credentials token with every form value URL-encoded', async () => {
  const { server, http } = fakeServer()
  await load(server).get()
  const token = http[0]
  expect(token.url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token')
  expect(token.contentType).toBe('application/x-www-form-urlencoded')
  expect(token.body).toBe(
    'grant_type=client_credentials&client_id=client-1&client_secret=s%26x%3D1&scope=https%3A%2F%2Fapi.businesscentral.dynamics.com%2F.default',
  )
})

test("calls BC in the session's company with an escaped, encoded filter and the bearer token", async () => {
  const { server, http } = fakeServer({ account: { name: 'X', chp_bccustomerno: "O'1 2", chp_bccompanyid: 'co-1' }, rows: [{ ...ROW, Customer_No: "O'1 2" }] })
  await load(server).get()
  const get = http[1]
  expect(get.url).toBe(
    "https://api.businesscentral.dynamics.com/v2.0/tenant-1/DEV/api/pasi/mcrm/v1.0/companies(co-1)/mcrmCustomers?$filter=Customer_No%20eq%20'O''1%202'&$select=Customer_No%2CName%2CAddress%2CAddress_2%2CCity%2CCounty%2CPost_Code%2CVATRegNo%2CPhone_No%2CEMail",
  )
  expect(get.headers).toEqual({ Authorization: 'Bearer tok-1', Accept: 'application/json' })
})

test('ignores customer or company ids sent in the request', async () => {
  const { server, http } = fakeServer({
    context: { ServerLogicName: 'company', QueryParameters: { customerNo: 'C99', companyId: 'other' }, Body: '{"customerNo":"C99"}' },
  })
  await load(server).get()
  expect(http[1].url).toContain('companies(co-1)/')
  expect(http[1].url).toContain("'C00000009'")
  expect(http[1].url).not.toContain('C99')
})

test.each([
  ['BC returns a different customer', { rows: [{ ...ROW, Customer_No: 'C00000001' }] }],
  ['BC returns no customer', { rows: [] }],
  ['nobody is signed in', { user: null }],
  ['the contact has no linked account', { account: null }],
  ['BC rejects the client credentials', { tokenStatus: 401 }],
  ['a BC site setting is missing', { settings: { ...SETTINGS, 'BC/ClientSecret': '' } }],
])('%s → only the customer-safe error', async (_case, options) => {
  const { server } = fakeServer(options as Parameters<typeof fakeServer>[0])
  await expect(load(server).get()).rejects.toThrow(SAFE)
})

test('makes no BC call when nobody is signed in', async () => {
  const { server, http } = fakeServer({ user: null })
  await expect(load(server).get()).rejects.toThrow(SAFE)
  expect(http).toEqual([])
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/server-logic/company.test.ts`
Expected: FAIL with ENOENT for `company.js`.

- [ ] **Step 3: Write `.powerpages-site/server-logic/company/company.js`, then stamp it**

```js
// Server Logic: company (S1-06 proof of the BC helpers; extended by S2-19)
// Purpose: the signed-in contact's own BC customer card.
// API URL: https://<site>/_api/serverlogics/company
// Customer and company come only from the session's Account; nothing is read from the request.

async function get() {
    // #region bc-helpers (generated from server-logic-src/bc-helpers.js — do not edit)
    // #endregion bc-helpers

    Server.Logger.Log("company GET called");
    return respond(async () => {
        var scope = sessionScope();
        var result = await bcGet(
            scope,
            "mcrmCustomers",
            odataQuery({
                $filter: "Customer_No eq " + odataLiteral(scope.customerNo),
                $select: "Customer_No,Name,Address,Address_2,City,County,Post_Code,VATRegNo,Phone_No,EMail"
            })
        );
        var rows = (result && result.value) || [];
        // Detail ownership check: exactly the session customer, nothing else.
        if (rows.length !== 1 || rows[0].Customer_No !== scope.customerNo) {
            throw new Error("not-found " + scope.customerNo);
        }
        var row = rows[0];
        return {
            customerNo: row.Customer_No,
            customerName: row.Name || "",
            address: [row.Address, row.Address_2, row.City, row.County, row.Post_Code]
                .filter((part) => part && String(part).trim())
                .join(", "),
            vatRegNumber: row.VATRegNo || "",
            phone: row.Phone_No || "",
            email: row.EMail || ""
        };
    });
}
```

Run: `node scripts/stamp-server-logic-helpers.mjs`
Expected: `stamped: …company.js`.

Then: `node scripts/stamp-server-logic-helpers.mjs --check`
Expected: exit 0 with no output.

- [ ] **Step 4: Metadata and validation**

```bash
PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6
node "$PP/skills/add-server-logic/scripts/create-serverlogic-metadata.js" --projectRoot . --name company --displayName "Company (BC customer card)" --description "Signed-in customer's BC card via the shared BC helpers (S1-06)" --webRoleIds 56b29291-b981-4ef0-865b-41c1e9523a97,11bb7218-55fb-4cae-b8a1-5af2f41237c5,c60ee1d9-f8e5-4d3d-9e9f-203a5d64e3b3,0c42c9f3-bc20-40a2-8c6a-a731a263ed83
echo "{\"cwd\":\"$(pwd -W)\"}" | node "$PP/skills/add-server-logic/scripts/validate-serverlogic.js"; echo "validator exit $?"
```

Expected: the YAML lists the 4 business role ids, and the validator exits 0.

- [ ] **Step 5: App type and dev mock**

In `src/api/types.ts` append:

```ts
/** GET /_api/serverlogics/company. Field names follow the wireframe's ACCOUNTS[]. */
export interface CompanyDto {
  customerNo: string
  customerName: string
  address: string
  vatRegNumber: string
  phone: string
  email: string
}
```

In `src/mocks/index.ts`:
- change the type import to `import type { CompanyDto, MeDto } from '@/api/types'`;
- add to `mocks` after `me`:

```ts
  // Wireframe ACCOUNTS[0]
  company: (): CompanyDto => ({
    customerNo: '10482',
    customerName: 'J.D. Santos Hardware & Construction Supply',
    address: 'Blk 12 Lot 4, National Highway, Brgy. San Isidro, Cabuyao, Laguna',
    vatRegNumber: '123-456-789-000',
    phone: '0917 552 6613',
    email: 'jd.santos@sample-customer.ph',
  }),
```

In `src/api/serverLogic.test.ts`, inside `describe('on the dev server', …)` add:

```ts
  test('serves the company fixture', async () => {
    sessionStorage.setItem(MOCK_SESSION_KEY, 'full@test.ph')
    expect((await serverLogic<CompanyDto>('company')).customerNo).toBe('10482')
  })
```

and change its type import to `import type { CompanyDto, MeDto } from './types'`.

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npm run lint`
Expected: all pass, including `bc-helpers.test.ts` test 2 now that `company.js` carries the region. Lint exits 0.

- [ ] **Step 7: Commit**

```bash
git add server-logic-src scripts/stamp-server-logic-helpers.mjs test/server-logic .powerpages-site/server-logic/company src/api/types.ts src/mocks/index.ts src/api/serverLogic.test.ts
git commit -m "S1-06: shared BC helpers stamped into Server Logic; company endpoint (session-scoped BC customer card)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Re-point the Dev test users to C00000009 — **APPROVAL** before Step 3

**Files:**
- Modify: `scripts/dataverse/seed_dev_test_users.py`

- [ ] **Step 1: Edit the seed**

Replace

```python
CUSTOMER = {'no': '10482', 'name': 'J.D. Santos Hardware & Construction Supply', 'company': 'Solid Cement'}
```

with

```python
# Real BC DEV customer (its contacts use the developer's own address). 10482 was the wireframe sample.
CUSTOMER = {'no': 'C00000009', 'name': 'BESTRADE COMMODITY SALES CORP.', 'company': 'Solid Cement'}
RETIRED_TEST_CUSTOMERS = ['10482']
```

After the `print(f"Account {CUSTOMER['no']} …")` line, add:

```python
# Retire earlier test accounts: drop their links, deactivate them (chp_accountlink → account is Restrict on delete).
for old_no in RETIRED_TEST_CUSTOMERS:
    for old in dv.get(f"accounts?$select=accountid&$filter=chp_bccustomerno eq '{odata_literal(old_no)}' and statecode eq 0")['value']:
        for link in dv.get(f"chp_accountlinks?$select=chp_accountlinkid&$filter=_chp_account_value eq {old['accountid']}")['value']:
            dv.session.delete(dv.base + f"chp_accountlinks({link['chp_accountlinkid']})").raise_for_status()
        dv.patch(f"accounts({old['accountid']})", {'statecode': 1, 'statuscode': 2})
        print(f"retired test account {old_no} ({old['accountid']})")
```

The existing contact loop already re-points `parentcustomerid` and creates the new link.

- [ ] **Step 2: Compile**

Run: `python -m py_compile scripts/dataverse/seed_dev_test_users.py && rm -rf scripts/dataverse/__pycache__ && echo ok`
Expected: `ok`.

- [ ] **Step 3: APPROVAL, then run twice**

Ask: "Re-point the five Dev test users to C00000009 · BESTRADE and deactivate the old 10482 test account?"

Run: `python scripts/dataverse/seed_dev_test_users.py`
Expected:
- `Account C00000009 · BESTRADE COMMODITY SALES CORP. (…)`;
- `retired test account 10482 …`;
- five invitation lines.

Run it **again**.
Expected: the account line, no `retired` line, the same five links.

- [ ] **Step 4: Commit**

```bash
git add scripts/dataverse/seed_dev_test_users.py
git commit -m "S1-06: Dev test users point at real BC DEV customer C00000009; retire the 10482 sample account

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Deploy and prove `company` live — **APPROVAL** before Step 1

- [ ] **Step 1: APPROVAL, deploy**

Ask: "Deploy the site with the BC/* site settings and the company endpoint?"

Run: `pac org who | grep -i "Org URL"`
Expected: `org380257ac`.

Run: `npm test && npm run build && pac pages upload-code-site --rootPath .`
Expected: tests pass and `upload succeeded`.

Run `git status --short`. Line-ending-only rewrites of `website.yml`: restore them. New generated metadata: commit it.

- [ ] **Step 2: Live check (the S1-06 done-when)**

In the signed-in Playwright browser (the private-site gate has been passed), sign in as `full@example.com` (password `Concreat#2026dev`). Then call:

```js
fetch('/_layout/tokenhtml').then(r=>r.text()).then(t=>fetch('/_api/serverlogics/company',{headers:{__RequestVerificationToken:t.match(/value="([^"]+)"/)[1],'X-Requested-With':'XMLHttpRequest'}})).then(async r=>({status:r.status, body:await r.text()}))
```

Expected: 200, with `data` holding `customerNo: "C00000009"` and `customerName: "BESTRADE COMMODITY SALES CORP."`.

If it isn't 200, decode the `x-ms-user-trace` header (as in sub-project B) and fix with a failing test first.

Then sign in as `norole@example.com` (remove any role first if needed) and call the same endpoint.
Expected: 403 "User does not have permissions to invoke Server Logic".

- [ ] **Step 3: Ledger note**

No commit if nothing changed. Record the result in the ledger.

---

### Task 6: Activation flow — **APPROVAL** before Step 1 and before Step 6

**Files:**
- Create: `scripts/dataverse/flow_sync.py`
- Create (pulled from Dev): `scripts/dataverse/activation_flow.json`
- Test: `test/flows/activation_flow.test.ts`
- Create (by plugin script): `.powerpages-site/cloud-flow-consumer/*.cloudflowconsumer.yml`
- Create: `.env.production`

- [ ] **Step 1: APPROVAL, then build the flow**

Ask: "Create the 'Concreat Connect – Request activation' flow in Dev (ConcreatHub; Dataverse + Office 365 Outlook connection references; HTTP to BC)?"

Use the **`power-automate:build-flow`** skill with the spec's §3 steps 1–15 **verbatim**, plus these binding details:
- **Trigger:** *When Power Pages calls a flow* (`type: Request`, `kind: PowerPages`), with one Text input titled exactly **`Email`**.
- **Environment variables:** read as solution parameters. The token HTTP action and any action that carries `chp_BCClientSecret` set `runtimeConfiguration.secureData.properties = ["inputs","outputs"]`.
- **BC calls:** HTTP actions. Put each OData query in the HTTP action's **queries** collection, not inline in the URI, so values are encoded:
  - `$filter`: `tolower(eMail) eq '<email with ' doubled>'`;
  - `$select`: `no,type,companyNo,name`;
  - `$top`: `20`.
- **Business relation lookup:** per distinct `companyNo`, `$filter` `contactNo eq '<companyNo>' and linktoTable eq 'Customer'` and `$select` `vendorNo`.
- **Branch:** a Switch on the number of distinct customer nos.: `0` → Return OK; `1` → continue; default → ops notice, then Return OK.
- **Every** business outcome ends in *Return value(s) to Power Pages* with an output `status` = `ok`.
- **Connections:** reuse the existing connection reference `chp_dataverse` for Dataverse; create an Office 365 Outlook connection reference `chp_outlook` on the developer's connection.
- **Ops notices:** sent to `chp_SenderMailbox`.
- **Invitation link:** `concat(parameters('chp_SiteUrl'), '/activate/complete?code=', <code>)`; the website bind uses `chp_PowerPagesSiteId`.
- Turn the flow on and report its workflow id.

- [ ] **Step 2: Write `scripts/dataverse/flow_sync.py`, then pull the definition into the repo**

```python
"""Keep a solution flow's definition in the repo. Dev only.

  python scripts/dataverse/flow_sync.py pull "<flow name>" scripts/dataverse/<file>.json
  python scripts/dataverse/flow_sync.py push "<flow name>" scripts/dataverse/<file>.json

pull writes the flow's clientdata (definition + connection references) to the file, pretty-printed.
push turns the flow off, writes the file back, and turns it on again (it is turned back on even if the
update is rejected, so the flow is never left off).
"""
import json
import sys

from dv import Dataverse

action, name, path = sys.argv[1], sys.argv[2], sys.argv[3]
dv = Dataverse()
found = dv.get(f"workflows?$select=workflowid,clientdata&$filter=name eq '{name.replace(chr(39), chr(39) * 2)}' and category eq 5")['value']
if not found:
    raise SystemExit(f'flow not found: {name}')
wf = found[0]['workflowid']

if action == 'pull':
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(json.loads(found[0]['clientdata']), f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'= pulled {name} ({wf}) → {path}')
elif action == 'push':
    with open(path, encoding='utf-8') as f:
        clientdata = json.load(f)
    dv.patch(f'workflows({wf})', {'statecode': 0, 'statuscode': 1})
    try:
        dv.patch(f'workflows({wf})', {'clientdata': json.dumps(clientdata)})
    finally:
        dv.patch(f'workflows({wf})', {'statecode': 1, 'statuscode': 2})
    print(f'= pushed {path} → {name} ({wf}), flow on')
else:
    raise SystemExit('usage: flow_sync.py pull|push "<flow name>" <file>')
```

Run:

```bash
python -m py_compile scripts/dataverse/flow_sync.py && rm -rf scripts/dataverse/__pycache__
python scripts/dataverse/flow_sync.py pull "Concreat Connect – Request activation" scripts/dataverse/activation_flow.json
grep -ci "client_secret\|clientsecret" scripts/dataverse/activation_flow.json
```

Expected:
- the pull line;
- the `grep` count refers **only to parameter names** such as `chp_BCClientSecret`, never a value.

Open the file and confirm no secret value appears. If one does, stop and remove it before anything is committed.

- [ ] **Step 3: Write the structure test** — `test/flows/activation_flow.test.ts`

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const clientdata = JSON.parse(readFileSync(resolve('scripts/dataverse/activation_flow.json'), 'utf8'))
const definition = clientdata.properties.definition
const text = JSON.stringify(definition)

function allActions(actions: Record<string, any>, out: [string, any][] = []): [string, any][] {
  for (const [name, action] of Object.entries(actions ?? {})) {
    out.push([name, action])
    for (const child of [action.actions, action.else?.actions, action.default?.actions, ...Object.values(action.cases ?? {}).map((c: any) => c.actions)]) {
      if (child) allActions(child, out)
    }
  }
  return out
}
const actions = allActions(definition.actions)

test('is triggered by Power Pages with a single Email input', () => {
  const [trigger] = Object.values(definition.triggers) as any[]
  expect(trigger.kind).toBe('PowerPages')
  expect(JSON.stringify(trigger.inputs)).toContain('"title":"Email"')
})

test('matches BC contacts by lower-cased email, with quotes doubled', () => {
  expect(text).toMatch(/tolower\(eMail\) eq/)
  expect(text).toMatch(/toLower\(/)
  expect(text).toContain("''''")
})

test('resolves customers through business relations linked to Customer', () => {
  expect(text).toContain('mcrmBusinessRelation')
  expect(text).toContain("linktoTable eq 'Customer'")
})

test('every Power Pages response returns status ok, and there is one per business outcome', () => {
  const responses = actions.filter(([, a]) => a.type === 'Response' && a.kind === 'PowerPages')
  expect(responses.length).toBeGreaterThanOrEqual(3)
  for (const [, a] of responses) expect(JSON.stringify(a.inputs)).toMatch(/"status":\s*"ok"/)
})

test('actions that handle the client secret or the token hide their inputs and outputs', () => {
  const sensitive = actions.filter(([, a]) => /ClientSecret|client_secret|access_token/i.test(JSON.stringify(a.inputs ?? {})))
  expect(sensitive.length).toBeGreaterThan(0)
  for (const [name, a] of sensitive) {
    expect(a.runtimeConfiguration?.secureData?.properties, name).toEqual(expect.arrayContaining(['inputs', 'outputs']))
  }
})

test('creates a single-use invitation', () => {
  expect(text).toContain('adx_invitations')
  expect(text).toMatch(/"adx_maximumredemptions":\s*1/)
})
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/flows`
Expected: PASS.

If an assertion fails because the built flow differs from the spec (e.g. no `secureData`, or the filter isn't lower-cased):
1. fix the JSON;
2. `python scripts/dataverse/flow_sync.py push "Concreat Connect – Request activation" scripts/dataverse/activation_flow.json`;
3. pull again, and re-run until green.

Record each fix as a ruling.

- [ ] **Step 5: Register the flow on the site and set the app's flow id**

```bash
PP=/c/Users/Michael/.claude-work/plugins/cache/power-platform-skills/power-pages/2.6.6
FLOW_ID=<workflow id reported in Step 1>
MSYS_NO_PATHCONV=1 node "$PP/skills/add-cloud-flow/scripts/create-cloud-flow-metadata.js" --fileSlug request-activation --flowName "Concreat Connect – Request activation" --flowId "$FLOW_ID" --flowTriggerUrl "" --flowApiUrl "/_api/cloudflow/v1.0/trigger/$FLOW_ID" --webRoleIds 24d62544-a66e-4660-81a6-ee467b783abb
cat .powerpages-site/cloud-flow-consumer/*.yml
printf 'VITE_ACTIVATION_FLOW_ID=%s\n' "$FLOW_ID" > .env.production
```

Expected:
- the YAML has `flowapiurl: /_api/cloudflow/v1.0/trigger/<id>` (no `C:/Program Files/Git` prefix);
- `adx_CloudFlowConsumer_adx_webrole` holds the Anonymous Users id.

Check that `git check-ignore .env.production` prints nothing, so the file is tracked.

- [ ] **Step 6: APPROVAL, deploy, then commit**

Ask: "Deploy the site with the activation flow registration and the flow id?"

Run: `pac org who | grep -i "Org URL" && npm test && npm run build && pac pages upload-code-site --rootPath .`
Expected: `upload succeeded`.

```bash
git add scripts/dataverse/flow_sync.py scripts/dataverse/activation_flow.json test/flows/activation_flow.test.ts .powerpages-site/cloud-flow-consumer .env.production
git commit -m "S1-03: activation flow (BC match, Q10 block, account/contact/link, pending grants, invitation email); registered for anonymous visitors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Live acceptance and close-out

Run all of these on the private Dev site in the Playwright browser, signed out of Concreat Connect unless stated. Check results in Dataverse with `dv.py` one-liners and in the flow's run history.

- [ ] **1. `company`:** already proven in Task 5. Re-run it once after Task 6's deploy.
- [ ] **2. Unique match:**
  1. Open `/activate` and submit the developer's address. Expected: "Check your email".
  2. The email arrives within 2 minutes; open the link → Set password `Concreat#2026dev` → you land signed in.
  3. Expected: "Your portal access is being set up" (no role).
  4. Dataverse: one Account (`C00000009`, DEV company id), one contact with that email whose `parentcustomerid` is that Account, and one Account Link.
  - **2b:** submit the same address in mixed case. Expected: the run reaches the "already activated" branch and no new invitation is created.
- [ ] **3. Q10:** submit `ai…@pasi.ph` (full address from the BC probe). Expected: "Check your email", no invitation row for it, and an ops notice listing several customer numbers in the developer's mailbox.
- [ ] **4. Unknown email:** `nobody-<timestamp>@example.com`. Expected: same screen, no Dataverse rows for it, and a flow run ending in the 0-customer branch.
- [ ] **5. Already active / re-run:** submit the developer's address again. Expected: no new invitation, and still exactly one contact, one link and one account.
- [ ] **6. Pending grant:**
  1. Reset: remove the developer contact's web roles, and delete its invitations if needed, so the "already activated" check doesn't stop the test. Instead, use a **fresh** contact path: deactivate the developer's portal contact login (Portal Management → Contact → clear *User Name* / login), or pick a second unique-email BC contact if the user provides one.
  2. Create a grant: developer email, `C00000009`, Orders & Delivery.
  3. Activate.
  4. Expected: the grant goes **Applied**, and the portal shows the Orders & Delivery sections.
  - If resetting the login isn't practical, record this check as **deferred to the first real activation** and verify the grant re-trigger by running step 11 against the existing contact: create the grant and update its customer no. to re-trigger. Expected: **Applied**.
- [ ] **7. Technical failure:**
  1. Ask the user to temporarily clear the `BC Client Secret` value in the maker portal.
  2. Submit the developer's address. Expected: the app shows "We couldn't send the activation email right now…", and the run failed at the token step with the secret masked in history.
  3. The user restores the value; resubmit and confirm "Check your email".
- [ ] **8. Close out:**
  - Update `docs/Concreat_Hub_Implementation_Plan.md`: S1-06 and S1-03 → `✅ Done (Dev)`. Notes: BC DEV facts, flow id, test customer C00000009, the plain-text secret exception (Key Vault in S1-14), the open BC asks (Blocked, website, secret rotation).
  - Run `npm test`, `npm run lint`, `npm run build` and `git diff --check`, then commit:

```bash
git add docs/Concreat_Hub_Implementation_Plan.md
git commit -m "S1-03/S1-06: Dev acceptance results; status Done (Dev)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
