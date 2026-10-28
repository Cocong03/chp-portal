# S1-12 Multi-company Activation (APO Cement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** APO Cement (and any later BC company) customers can activate and use Concreat Connect, scoped to their own company, with one email = one customer across all companies.

**Architecture:** A new Dataverse table `chp_bccompany` lists the BC companies per environment. The activation flow loops over its active rows and counts (company, customer) pairs for the Q10 rule; access grants get a required Company lookup that the grant flow and activation compare. Server Logic and the SPA are untouched (they already scope by the Account's `chp_bccompanyid`).

**Tech Stack:** Dataverse Web API scripts (Python, `scripts/dataverse/dv.py`), Power Automate flow definitions as JSON (`scripts/dataverse/*.json`) with structural Vitest tests (`test/flows/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-27-s1-12-multi-company-activation-design.md`

## Global Constraints

- Dev only: Power Platform `org380257ac`, BC environment `DEV`. `dv.py` refuses other orgs.
- Companies (Dev rows): **Solid Cement** `d2e4496e-be79-f111-8070-6045bd2058e3`, **APO Cement** `6b92847e-637e-f111-8071-6045bd2051b9`. `chp_name` is written to Account `chp_bccompanyname` verbatim.
- Every Dataverse component goes in solution `ConcreatHub` (the `dv.py` session header does this).
- Flow JSON never contains a company GUID, site URL or mailbox literal (existing test regex `/f44e98b4|d2e4496e|188fc244|chp-portal-dev|automations365/` must keep passing for the activation flow; add `6b92847e` to it).
- Every user value in an OData `$filter` has single quotes doubled (rule 4). Company GUIDs come from Dataverse rows, not users.
- BC actions keep `runtimeConfiguration.secureData` on `inputs` and `outputs`.
- Never print the BC secret or token. Never commit `.env` or secrets.
- Grant status option values: Pending 775000000, Applied 775000001, Customer mismatch 775000002, Duplicate email 775000003, Revoked 775000004.
- Reference task ID **S1-12** in every commit message. End commits with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Same customer no. in two companies** (`michael+c2@…` → Solid C00000002 + APO C00000002) must count as **two** matches and block. Pinned in Task 3 (`appends one match per company and customer`).
2. **A company where the email has no BC contacts** must not send BC an empty `() and linktoTable eq 'Customer'` filter. Pinned in Task 3 (`skips the relation lookup for a company with no contacts`).
3. **Inactive company rows** are not searched. Pinned in Task 3 (`lists only active companies`).
4. **A Pending grant (never applied) with a mismatching company** must not strip roles from the contact. Pinned in Task 2 (`a mismatch removes roles only when the grant was Applied`).
5. **GUID case** differences between the Account's company ID and the company row must not cause a false mismatch. Pinned in Task 2 (`compares company ids case-insensitively`).

---

### Task 1: BC Companies table, grant Company lookup, admin access

**Files:**
- Create: `scripts/dataverse/companies_schema.py`
- Modify: `scripts/dataverse/admin_role.py` (PRIVILEGES)
- Modify: `scripts/dataverse/admin_form_view.py` (FORM_FIELDS, VIEW_COLUMNS)
- Modify: `docs/runbooks/portal-access.md` ("Give a role" step 2)

**Interfaces:**
- Consumes: `identity_schema.text`, `ensure_table`, `ensure_attribute`, `ensure_key`, `ensure_lookup` (import them; `identity_schema` only runs `main()` under `__main__`).
- Produces (Dataverse): table `chp_bccompany` (entity set — read `EntitySetName` from metadata and print it; expected `chp_bccompanies`), row id `chp_bccompanyid`, columns `chp_name`, `chp_bccompanyguid`; alternate key `chp_bccompanyguid_key` on `chp_bccompanyguid`; lookup `chp_accessgrant.chp_company` (Web API `_chp_company_value`, bind name `chp_Company`), relationship `chp_bccompany_chp_accessgrant`, delete behavior `Restrict`, **ApplicationRequired** at the end of the script.

- [ ] **Step 1: Write `companies_schema.py`** (idempotent, same header/usage docstring style as `identity_schema.py`), in this order:
  1. `ensure_table('chp_BCCompany', 'BC Company', 'BC Companies', 'BC companies the portal serves, one row per company per environment (S1-12).', text('chp_Name', 'Name', 100, is_required=True, primary=True))`
  2. `ensure_attribute('chp_bccompany', text('chp_BCCompanyGuid', 'BC Company ID', 36, is_required=True))`
  3. `ensure_key('chp_bccompany', 'chp_bccompanyguid_key', 'BC company ID', ['chp_bccompanyguid'])`
  4. `ensure_lookup('chp_accessgrant', 'chp_Company', 'Company', 'chp_bccompany', 'chp_bccompany_chp_accessgrant', False, 'Restrict')`
  5. PublishXml for `chp_bccompany` and `chp_accessgrant`.
  6. Seed: `COMPANIES = [('Solid Cement', 'd2e4496e-…'), ('APO Cement', '6b92847e-…')]` (full GUIDs from Global Constraints); upsert each with `dv.patch(f"{entity_set}(chp_bccompanyguid='{guid}')", {'chp_name': name})`. The alternate key must be Active first: poll `EntityDefinitions(LogicalName='chp_bccompany')/Keys?$select=EntityKeyIndexStatus` until `Active` (max ~2 min) before upserting.
  7. Backfill: every `chp_accessgrants` row with `_chp_company_value eq null` (active and inactive) gets `{'chp_Company@odata.bind': f'/{entity_set}({solid_row_id})'}`. Print the count.
  8. Make the lookup required: GET `EntityDefinitions(LogicalName='chp_accessgrant')/Attributes(LogicalName='chp_company')/Microsoft.Dynamics.CRM.LookupAttributeMetadata`, set `RequiredLevel.Value = 'ApplicationRequired'`, `dv.session.put(...)` the same URL with header `MSCRM.MergeLabels: true`; raise on non-2xx. Publish `chp_accessgrant` again.

- [ ] **Step 2: Run it twice**

Run: `python scripts/dataverse/companies_schema.py` then the same again.
Expected: first run prints `+` lines and `backfilled N grants`; second run prints only `=` lines and `backfilled 0 grants`.

- [ ] **Step 3: Verify rows and backfill**

Run (dataverse MCP `read_query` or a one-off `dv.get`): `chp_bccompanies?$select=chp_name,chp_bccompanyguid` → exactly the 2 rows above; `chp_accessgrants?$select=chp_email&$filter=_chp_company_value eq null` → 0 rows.

- [ ] **Step 4: Admin access.** In `admin_role.py` add `('prvReadchp_bccompany', 'Global'), ('prvAppendTochp_bccompany', 'Global')` to `PRIVILEGES`. In `admin_form_view.py` add `('chp_company', 'Company', LOOKUP, False)` to `FORM_FIELDS` right after `chp_email`, and `('chp_company', 150)` to `VIEW_COLUMNS` right after `chp_email`. Run both scripts.
Expected: `= N privileges set`; `= main form …: 8 fields`; `= view …: 7 columns, newest first`.

- [ ] **Step 4b: Add the table to the admin app (maker portal, by hand).** make.powerapps.com → Dev → Solutions → ConcreatHub → Concreat Connect Admin → Edit → **Add page** → Dataverse table → **BC Company** → Save → Publish. Ask the user to do this if no browser automation is available, and wait for confirmation.

- [ ] **Step 5: Runbook.** In `docs/runbooks/portal-access.md` "Give a role" step 2 becomes: "Enter the **email**, the **Company** (Solid Cement or APO Cement), the BC **customer no.** and the **role**, then **Save**." Add one sentence under it: "Customer numbers repeat between companies (APO's C00000002 is a different customer from Solid Cement's), so the Company must match the customer."

- [ ] **Step 6: Commit**

```bash
git add scripts/dataverse/companies_schema.py scripts/dataverse/admin_role.py scripts/dataverse/admin_form_view.py docs/runbooks/portal-access.md
git commit -m "S1-12: BC Companies table (Solid Cement, APO Cement), required Company on access grants (backfilled to Solid Cement), admin role/form/view"
```

---

### Task 2: Grant flow matches company and revokes on a mismatch after Applied

**Files:**
- Modify: `scripts/dataverse/grant_flow.json`
- Test: `test/flows/grant_flow.test.ts`

**Interfaces:**
- Consumes: Task 1's `_chp_company_value`, `chp_bccompanies`, `chp_bccompanyguid`.
- Produces: action names `Get_grant_company`, `Was_applied`, `Remove_roles_on_mismatch`, `Unrelate_role_on_mismatch` (only referenced by tests).

- [ ] **Step 1: Write the failing tests** (append to `grant_flow.test.ts`; also add `'chp_company'` to the `arrayContaining` list in the existing trigger test):

```ts
// S1-12 (2026-10-27): customer numbers repeat across BC companies, so a grant matches on customer no. AND company.
test('reads the grant company and compares company ids case-insensitively', () => {
  expect(definition.actions.Get_grant.inputs.parameters.$select.split(',')).toEqual(
    expect.arrayContaining(['_chp_company_value', 'chp_status']),
  )
  const company = findAction(definition.actions, 'Get_grant_company')
  expect(company.inputs.parameters).toMatchObject({
    entityName: 'chp_bccompanies', recordId: "@outputs('Get_grant')?['body/_chp_company_value']", $select: 'chp_bccompanyguid',
  })
  expect(findAction(definition.actions, 'Get_parent_account').inputs.parameters.$select).toBe('chp_bccustomerno,chp_bccompanyid')
  const conditions = JSON.stringify(findAction(definition.actions, 'Customer_matches').expression)
  expect(conditions).toContain(`"@actions('Get_grant_company')?['status']","Succeeded"`)
  expect(conditions).toContain(
    `"@toLower(string(outputs('Get_parent_account')?['body/chp_bccompanyid']))","@toLower(string(outputs('Get_grant_company')?['body/chp_bccompanyguid']))"`,
  )
})

test('a mismatch removes roles only when the grant was Applied', () => {
  const mismatch = findAction(definition.actions, 'Customer_matches').else.actions
  const wasApplied = mismatch.Was_applied
  expect(JSON.stringify(wasApplied.expression)).toContain(`"@outputs('Get_grant')?['body/chp_status']",775000001`)
  const remove = wasApplied.actions.Remove_roles_on_mismatch
  expect(remove.type).toBe('Foreach')
  expect(JSON.stringify(remove.foreach)).toContain("outputs('List_current_business_roles')")
  expect(remove.actions.Unrelate_role_on_mismatch.inputs.host.operationId).toBe('DisassociateEntities')
  expect(mismatch.Set_status_Customer_mismatch.runAfter).toEqual({ Was_applied: ['Succeeded'] })
})

test('the business roles are listed before the match check so a mismatch can remove them', () => {
  expect(findAction(definition.actions, 'Customer_matches').runAfter).toEqual({ List_current_business_roles: ['Succeeded'] })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/flows/grant_flow.test.ts`
Expected: the 3 new tests and the trigger test FAIL; the rest pass.

- [ ] **Step 3: Edit `grant_flow.json`**
  - Trigger `filteringattributes`: `chp_email,chp_bccustomerno,chp_company,chp_webrole,statecode`.
  - `Get_grant.$select`: add `_chp_company_value,chp_status`.
  - Inside `One_contact`: `Get_parent_account.$select` = `chp_bccustomerno,chp_bccompanyid`; new `Get_grant_company` (GetItem, runAfter `Get_parent_account` [Succeeded, Failed]); move `List_current_business_roles` out of `Customer_matches` to run after `Get_grant_company` [Succeeded, Failed] (same `$filter`); `Customer_matches` runAfter `List_current_business_roles` [Succeeded] and gets two more `and` conditions (status Succeeded, case-insensitive GUID equality as in the test); inside it `Grant_is_active` now runs after `Grant_role_name`.
  - Mismatch `else`: new `Was_applied` If (`equals` `@outputs('Get_grant')?['body/chp_status']`, `775000001`) whose actions are `Remove_roles_on_mismatch` (Foreach over `@outputs('List_current_business_roles')?['body/value']`, body copied from `Remove_all_business_roles`/`Unrelate_role` with the new names); `Set_status_Customer_mismatch` runAfter `Was_applied` [Succeeded], parameters unchanged.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/flows/grant_flow.test.ts`
Expected: all PASS.

- [ ] **Step 5: Deploy and verify live** (Dev)

Run: `python scripts/dataverse/grant_flow.py`
Expected: `= flow exists (…), definition updated`, `= flow turned on`, `in ConcreatHub: True`. If the definition is rejected, the script restores the old one; fix and rerun.
Then in Concreat Connect Admin, open an existing Applied grant and save it unchanged → status stays Applied (flow run succeeds in run history).

- [ ] **Step 6: Commit**

```bash
git add scripts/dataverse/grant_flow.json test/flows/grant_flow.test.ts
git commit -m "S1-12: grant flow matches customer no. + company; editing an Applied grant to another company removes the role"
```

---

### Task 3: Activation flow searches every active company

**Files:**
- Modify: `scripts/dataverse/activation_flow.json`
- Test: `test/flows/activation_flow.test.ts`

**Interfaces:**
- Consumes: Task 1's `chp_bccompanies` (`chp_bccompanyid`, `chp_bccompanyguid`, `chp_name`, `statecode`), grant `_chp_company_value`.
- Produces: action names `BC_api_root`, `Init_Matches`, `List_companies`, `For_each_company`, `Company_url`, `Has_BC_contacts`, `For_each_customer`, `Append_match`, `Match_labels`, `Match` (tests reference them). `Customer_no`, `Customer_literal`, `No_customer`, `Several_customers` keep their names. `BC_base_url`, `No_BC_contact`, `Return_no_match`, `Stop_no_match` are removed.

- [ ] **Step 1: Write the failing tests** in `activation_flow.test.ts`:
  - In `each business outcome returns its status`: drop `'Return_no_match'` from the ok list.
  - In `reads every environment-specific value…`: drop `'chp_BCSolidCementCompanyId'` from the expected list; extend the regex to `/f44e98b4|d2e4496e|6b92847e|188fc244|chp-portal-dev|automations365/`; add `expect(text).not.toContain('chp_BCSolidCementCompanyId')`.
  - Add:

```ts
// S1-12 (2026-10-27): companies come from the chp_bccompany table; one email = one customer across all of them.
test('lists only active companies and searches each one in its own BC company', () => {
  const [, list] = actions.find(([n]) => n === 'List_companies')!
  expect(list.inputs.parameters).toMatchObject({
    entityName: 'chp_bccompanies', $select: 'chp_bccompanyid,chp_bccompanyguid,chp_name', $filter: 'statecode eq 0',
  })
  const [, loop] = actions.find(([n]) => n === 'For_each_company')!
  expect(loop.type).toBe('Foreach')
  expect(loop.foreach).toBe("@outputs('List_companies')?['body/value']")
  const [, url] = actions.find(([n]) => n === 'Company_url')!
  expect(url.inputs).toBe("@{outputs('BC_api_root')}companies(@{items('For_each_company')?['chp_bccompanyguid']})/")
  for (const name of ['Get_BC_contacts', 'Get_BC_relations']) {
    expect(actions.find(([n]) => n === name)![1].inputs.uri, name).toMatch(/^@\{outputs\('Company_url'\)\}/)
  }
})

test('skips the relation lookup for a company with no contacts', () => {
  const [, has] = actions.find(([n]) => n === 'Has_BC_contacts')!
  expect(JSON.stringify(has.expression)).toContain("@greater(length(body('Company_nos')), 0)")
  expect(Object.keys(has.actions)).toEqual(expect.arrayContaining(['Relation_filters', 'Get_BC_relations', 'For_each_customer']))
})

test('appends one match per company and customer, so the same customer no. in two companies counts twice', () => {
  const [, append] = actions.find(([n]) => n === 'Append_match')!
  expect(append.type).toBe('AppendToArrayVariable')
  expect(append.inputs).toEqual({
    name: 'Matches',
    value: {
      companyRowId: "@items('For_each_company')?['chp_bccompanyid']",
      companyId: "@items('For_each_company')?['chp_bccompanyguid']",
      companyName: "@items('For_each_company')?['chp_name']",
      customerNo: "@items('For_each_customer')",
    },
  })
  const several = JSON.stringify(actions.find(([n]) => n === 'Several_customers')![1].expression)
  expect(several).toContain("@greater(length(variables('Matches')), 1)")
  const none = JSON.stringify(actions.find(([n]) => n === 'No_customer')![1].expression)
  expect(none).toContain("@equals(length(variables('Matches')), 0)")
  const [, labels] = actions.find(([n]) => n === 'Match_labels')!
  expect(labels.inputs.select).toBe("@concat(item()?['companyName'], ' ', item()?['customerNo'])")
  const mail = actions.find(([n]) => n === 'Ops_notice_several_customers')![1].inputs.parameters['emailMessage/Body']
  expect(mail).toContain("@{join(body('Match_labels'), ', ')}")
})

test("the single match's company drives the customer lookup, the account and pending grants", () => {
  expect(actions.find(([n]) => n === 'Match')![1].inputs).toBe("@first(variables('Matches'))")
  expect(actions.find(([n]) => n === 'Get_BC_customer')![1].inputs.uri).toBe(
    "@{outputs('BC_api_root')}companies(@{outputs('Match')?['companyId']})/mcrmCustomers",
  )
  expect(actions.find(([n]) => n === 'List_accounts')![1].inputs.parameters.$filter).toBe(
    "chp_bccustomerno eq '@{outputs('Customer_literal')}' and chp_bccompanyid eq '@{outputs('Match')?['companyId']}'",
  )
  const create = actions.find(([n]) => n === 'Create_account')![1].inputs.parameters
  expect(create['item/chp_bccompanyid']).toBe("@{outputs('Match')?['companyId']}")
  expect(create['item/chp_bccompanyname']).toBe("@{outputs('Match')?['companyName']}")
  expect(actions.find(([n]) => n === 'List_pending_grants')![1].inputs.parameters.$filter).toContain(
    "_chp_company_value eq @{outputs('Match')?['companyRowId']}",
  )
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run test/flows/activation_flow.test.ts`
Expected: new tests and the edited ones FAIL.

- [ ] **Step 3: Edit `activation_flow.json`**
  - Remove parameter `BC Solid Cement Company ID (chp_BCSolidCementCompanyId)`.
  - `Init_Matches` (InitializeVariable, `Matches`, type `array`, value `[]`) chained after `Init_Username`.
  - Rename `BC_base_url` → `BC_api_root`; inputs end at the API base path plus `/` (no `companies(...)`).
  - `List_companies` (Dataverse ListRecords) after `BC_api_root`; `For_each_company` after it with `runtimeConfiguration.concurrency.repetitions: 1`. Inside: `Company_url` → `Get_BC_contacts` → `Company_no_list` → `Company_nos` → `Has_BC_contacts` (If) containing `Relation_filters` → `Get_BC_relations` → `Customer_no_list` → `Customer_nos` → `For_each_customer` (Foreach over `@body('Customer_nos')`) → `Append_match`. Keep existing queries/secureData of the moved actions; only the URIs change.
  - Remove `No_BC_contact`. `No_customer` runs after `For_each_company` and tests `length(variables('Matches'))` (the per-company `Customer_nos` is no longer visible here). Its body/Return/Stop are unchanged.
  - `Match_labels` (Select from `@variables('Matches')`) before `Several_customers`; `Several_customers` uses `variables('Matches')`; ops email lists "Customers: @{join(body('Match_labels'), ', ')}" instead of the customer-number join.
  - `Match` = `@first(variables('Matches'))`; `Customer_no` = `@outputs('Match')?['customerNo']`.
  - `Get_BC_customer`, `List_accounts`, `Create_account`, `List_pending_grants` as in the test. `Ops_notice_several_contacts` and `Ops_notice_linked_elsewhere` bodies say `@{outputs('Match')?['companyName']} @{outputs('Customer_no')}` wherever they print the customer number.
  - A failed BC call inside the loop fails the loop and the run (no `runAfter` that tolerates `Failed`), so activation never continues after a partial search.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/flows`
Expected: all PASS.

- [ ] **Step 5: Deploy**

Run: `python scripts/dataverse/portal_flows.py --only ACTIVATION`
Expected: `= ACTIVATION: flow exists (…), definition updated`. If rejected, the script restores the previous definition; fix and rerun.

- [ ] **Step 6: Commit**

```bash
git add scripts/dataverse/activation_flow.json test/flows/activation_flow.test.ts
git commit -m "S1-12: activation searches every active BC company; Q10 counts company + customer pairs; account and grants use the match's company"
```

---

### Task 4: Live acceptance on Dev, retire the Solid Cement env var, docs

**Files:**
- Modify: `scripts/dataverse/seed_dev_test_users.py`, `scripts/dataverse/bc_probe.py`, `scripts/dataverse/bc_probe_orders.py`, `scripts/dataverse/env_vars.py`
- Modify: `CLAUDE.md`, `docs/Concreat_Hub_Architecture.md`, `docs/Concreat_Hub_Implementation_Plan.md`, `docs/Concreat_Hub_Registration_Architecture.md`

**Interfaces:**
- Consumes: Tasks 1–3 deployed on Dev.
- Produces: no shared helper. Each script reads the company GUID with one `dv.get("chp_bccompanies?$select=chp_bccompanyguid&$filter=chp_name eq '<name>'")` (name defaults to `Solid Cement`; `bc_probe*.py` accept an optional `--company "APO Cement"`).

- [ ] **Step 1: Live acceptance** — run each check from the site `https://chp-portal-dev.powerappsportals.com` (Activate page) and the flow run history; Playwright MCP or ask the user to click. Record pass/fail per item:
  1. Activate with the existing Solid test address (C00000009) → "Check your email"; Account unchanged (company Solid Cement).
  2. Activate `michael+c2-apo@automations365.com` → email arrives; new Account C00000002 with `chp_bccompanyid` = `6b92847e-…`, `chp_bccompanyname` = `APO Cement`.
  3. Activate `michael+c2@automations365.com` → "needs help" message; ops email lists `Solid Cement C00000002, APO Cement C00000002`; no Account/Contact created.
  4. Create grant (APO Cement, C00000002, `michael+c2-apo@…`, Full Access) → Applied. Sign in as that user: topbar "Viewing **APO Cement** · …"; Dashboard, Delivery Sites, Orders, Ledger, Documents, Account page load APO data only (compare one value per page against BC APO; none of Solid C00000002's orders appear).
  5. Place a cash order as that user → quote shows prices; submit succeeds; the sales order exists in BC **APO** with the chosen receiving time and payment method `CASH`. (Creates a real record in BC DEV, which is allowed.)
  6. Edit that grant's Company to Solid Cement → status Customer mismatch; the user's next page load shows "Your portal access is being set up". Set it back to APO Cement → Applied again.
  7. Existing grants show Company = Solid Cement.
  If any check fails, stop and use superpowers:systematic-debugging before changing anything.

- [ ] **Step 2: Scripts stop reading `chp_BCSolidCementCompanyId`.** Replace the env-var reads in `seed_dev_test_users.py`, `bc_probe.py`, `bc_probe_orders.py` with the `chp_bccompanies` lookup above; remove the `chp_BCSolidCementCompanyId` line from `env_vars.py` `VALUES`.
Run: `grep -rn "SolidCementCompanyId" scripts test src .powerpages-site server-logic-src`
Expected: no matches.

- [ ] **Step 3: Delete the env var in Dev** (only after Step 1 passed): delete its `environmentvariablevalues` row, then the `environmentvariabledefinitions` row (schema name `chp_BCSolidCementCompanyId`), via `dv.session.delete`; confirm `dv.get(...$filter=schemaname eq 'chp_BCSolidCementCompanyId')` returns an empty `value`. Flows must already be redeployed (Task 3), or their import will break.

- [ ] **Step 4: Docs.**
  - `CLAUDE.md`: "BC companies" bullet → Solid Cement and APO Cement enabled (2026-10-27), companies are rows in `chp_bccompany` (adding a company = a row per environment); env var list drops `chp_BCSolidCementCompanyId`; "All environment-specific values are Dataverse environment variables" gets "except BC company IDs, which are `chp_bccompany` rows".
  - Architecture doc: line ~129 (company scope), ~157/~337 (config), ~334 (BC companies row), Q10 row ~366 (decided: block across companies), Dataverse table list (add `chp_bccompany`; grant has Company).
  - Implementation plan: S1-12 → ✅ Done (Dev) with a one-line note (date, table, test emails); S1-14 gains "seed `chp_bccompany` rows per environment".
  - Registration doc §7 line ~193: replace the "Enabling APO Cement later" bullet with what was built.
Run: `git diff --check` and `npm test`, `npm run lint`, `npm run build`.
Expected: no whitespace errors; all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/dataverse CLAUDE.md docs
git commit -m "S1-12: APO Cement verified on Dev; chp_BCSolidCementCompanyId retired; docs record the companies table and cross-company Q10"
```
