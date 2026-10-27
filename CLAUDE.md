# CHP Portal (Concreat Connect)

Customers see the portal as **Concreat Connect** (wireframe name; decided 2026-10-04). "Concreat Hub" survives only in internal identifiers (solution `ConcreatHub`, doc file names).

Customer portal for **Concreat Holdings (CHP)** customers. Customers sign in, place and track cement orders, view their ledger and documents, manage delivery sites, and submit requests/complaints. **Business Central (BC) is the system of record**; the portal consumes BC through APIs built by the BC team.

- Release 1 target: **Nov 15, 2026** (full portal, scope still PROPOSED). Client "Phase 2" (account switcher, feature completion): **after Jan 1, 2027**.
- BC companies: **Solid Cement only for now** (decided Oct 1, 2026). APO Cement comes later (plan task S1-12), so keep every BC call company-aware: the company ID comes from the Account record or an env var, never a hardcoded value.

## Read these first

| Doc                                              | Use it for                                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `docs/Concreat_Hub_Architecture.md`              | The architecture. Follow it; propose changes there before deviating                                       |
| `docs/Concreat_Hub_Implementation_Plan.md`       | Task IDs (S0–S5, P2), dependencies, "done when" checks. Reference task IDs in commits/PRs                 |
| `docs/Concreat_Hub_Registration_Architecture.md` | Sign-in/activation design ported from the POC, plus lessons learned                                       |
| `Mockup-chp-v2.html` (wireframe)                 | **The UI spec.** Exact fields, labels, dropdown values, copy and behavior. Build to it; don't redesign it |

| Power Platform / BC Developer Packages (.docx)

Task exported for Phase 1 from Monday.com see at docs\Task-for Phase-1-exported-from-Monday-com.xlsx

Postman collection sample that bc team uses for monday.com that theyre planning to also use it on us(Power Platform Developer)
see at docs\bc-api-collection.json

## UI Mockup

- see at docs\Mockup-chp-v2.html (updated at 10/08/2026)

## Tech stack

- Power Pages **code site**: React 19 + Vite + TypeScript, **Tailwind CSS v4** (`@theme` tokens, `source("..")` limited to `src/`), **Lucide React** icons
- Data fetching: TanStack Query; Excel export: SheetJS (lazy-loaded)
- Tanstack Table
- **Power Pages Server Logic** (GA since Apr 6, 2026) as the backend-for-frontend to BC
- **Dataverse** for portal-owned data, accessed through the Power Pages Web API with table permissions
- **Power Automate** for async back-office work only
- Power Pages **local authentication** (email + password), invitation-only registration
- React Hook Form
- Shadcn UI
- Zod
- BC API / BC Custom API
- Zustand if needed
- date-fns
- Sonner

# UI & Design System

- use this design system for branding and styles at DESIGN.md

Prefer **shadcn/ui** components over custom recreations.

Examples:

- Button
- Card
- Dialog
- Dropdown Menu
- Select
- Tabs
- Checkbox
- Tooltip
- Popover
- Progress
- Separator

## Architecture rules (non-negotiable)

1. **BC is the only store of business data.** Never copy orders, ledger, prices, credit, ship-tos or documents into Dataverse. Read them live from BC.
2. **The browser never calls BC.** All BC calls go through Server Logic (`/_api/serverlogics/<name>`) using the portal's app identity (client credentials).
3. **Scope every BC call from the session, never from the request.** Every Server Logic function: `Server.User` → contact → active Account (`chp_bccustomerno`, `chp_bccompanyid`) → BC company + customer filter. Ignore any customer/company id sent by the client. Detail endpoints verify that the BC record belongs to the session customer.
4. **Escape every user value placed in an OData `$filter`** (double single quotes).
5. **No business math in the SPA.** Prices, freight, other charges and available credit come from BC. The SPA only sums for display. Order submit re-quotes and re-checks credit on the server and never trusts client totals.
6. **Dataverse owns only portal data:** Contact/Account identity, `chp_accountlink`, web roles, drafts, requests, complaints, site requests, Excel uploads, taxonomy tables, announcement. Account stores only BC identity keys (customer no., name, company).
7. **Power Automate is never on a synchronous read path.** Use it for activation, routing submissions, notifications.
8. **Security is server-side.** Web roles on every Server Logic record and table permissions (mostly Account scope via `parentcustomerid`). Client-side role checks are UX only.
9. **Design for multiple linked accounts per contact** (Phase 2 switcher) even though Nov 15 ships one link per contact.

## Web roles

`Full Access` · `Orders & Delivery` · `Finance & Documents` · `View Only`. The page matrix is in Architecture §4. Activation does not grant a business role (decision D4 pending). **Access grants in Concreat Connect Admin are the source of truth for roles** (decided 2026-10-08): a grant adds or replaces the contact's business role, Deactivate revokes, Activate restores; grants can't be deleted. Don't assign roles in Portal Management.

## Repository conventions

```
src/
  api/          serverLogic.ts (single CSRF-aware caller) · webApi.ts · types.ts (DTOs)
  auth/         auth.ts · activation.ts · useMe() · RequireRole (UX only)
  layout/       AppShell (topbar + logo, nav, help)
  modules/      dashboard · orders · sites · ledger · documents · requests · complaints · account
  ui/           shared components (Table, Pagination, StatusPill, Money, Modal…)
  lib/          format (peso ₱, dates) · excel export
  mocks/        DTO fixtures built from the wireframe's sample data
.powerpages-site/   site metadata: server-logic, site-settings, web-roles, table-permissions, cloud-flow-consumer
docs/               architecture, plan, registration docs
```

- **DTO shapes mirror the wireframe's sample arrays** (`ORDERS`, `SITES`, `CATALOG`, `LEDGER_ENTRIES`…). Keep the field names so the SPA and BFF stay aligned.
- **Server Logic can't `require`/`import`**, and banned patterns include `eval`, `setTimeout`, `delete`, `prototype`, `Reflect.`. Each record carries a copy of the shared helpers (token, BC GET/POST, OData escape, scoping). Keep the copies identical and generate them from one template; don't hand-edit them per file.
- Server Logic HttpClient bodies are strings. Binary files (PDFs) come from BC as **base64 JSON**.
- **All environment-specific values are Dataverse environment variables**: BC tenant, BC environment name, company IDs, API base path, site URL, sender mailbox. **Secrets: Key Vault → secret env var → site setting.** Never hardcode them.
  - **Exception (Dev only, decided 2026-10-04):** `chp_BCClientSecret` is a plain-text environment variable (no default value, value set by hand in Dev only) instead of Key Vault. Moving it to Key Vault is part of S1-14 and must happen before UAT. Never put its value in chat, files or git.
- Order status mapping (confirmed 2026-09-14): BC Open → _Open_ · Pending Prepayment → _Pending Prepayment_ · Released → _Ready for Dispatch_ · archived + Completely Shipped → _Completely Shipped_ · Completely Shipped + Invoiced → _Invoiced_.
- Customer-facing copy uses the wireframe's wording exactly (renames per the packages, e.g. "+ New Multiple Order", "Account and User Management"). Never show BC jargon (location codes, table names) or the name of CHP's internal service-center system.
- Every page sets `document.title` as `"<Page> — Concreat Connect"`.
- Publisher **Concreat Holdings**, prefix `chp_` (option-value prefix 77500), solution **`ConcreatHub`**. Create every Dataverse component in that solution.
- Environment variables (in `ConcreatHub`): `chp_BCTenantId`, `chp_BCEnvironmentName`, `chp_BCSolidCementCompanyId`, `chp_BCApiBasePath`, `chp_SiteUrl`, `chp_SenderMailbox`, `chp_PowerPagesSiteId`, `chp_BCClientId`, `chp_BCClientSecret` (see the Dev exception above), `chp_EmailLogoUrl` (public PNG for emails; mail clients can't read the private portal). Server Logic reads the BC ones through the `BC/*` site settings.

## Environments

|      | Power Platform                                                   | BC                                                                                                     |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Dev  | _CHP Customer Portal_ (`https://org380257ac.crm5.dynamics.com/`) | Concreat Sandbox Dev - environment `DEV` (renamed from TRAINING 2026-10-04) · SOLID CEMENT CORPORATION |
| UAT  | TBD                                                              | Concreat UAT sandbox                                                                                   |
| Prod | TBD                                                              | Concreat production                                                                                    |

- **Never develop or test against BC production.** Orders and activations create real records and send real emails.
- Confirm the target with `pac auth who` before any deploy. Deploy only with `pac pages upload-code-site` (**never** `pac pages upload`).
- Sites stay **private** until go-live; making a site public needs explicit approval.

## Commands

```bash
npm run dev        # local dev; auth and Server Logic are mocked on localhost
npm run build      # tsc -b && vite build
pac pages upload-code-site --rootPath .   # deploy to the confirmed environment
```

## Tooling for Claude

- Use the **power-pages plugin skills** for site work: `/deploy-site`, `/setup-auth`, `/add-server-logic`, `/integrate-webapi`, `/add-cloud-flow`, `/create-webroles`, `/audit-permissions`, `/security-review`, `/plan-alm`, `/setup-pipeline`, `/test-site`.
- Use the **dataverse skills/MCP** for tables, columns and queries; **context7** for library docs (React, Vite, Tailwind, TanStack Query); **Microsoft Learn** for Power Platform and BC.
- **Check feature status (preview vs GA) and limits on Microsoft Learn** before relying on them; plugin text can be outdated.
- Follow the React best-practices skill when writing components.

## Known gotchas (from the POC)

- New environments may block `.js` attachments. Removing `js` from `blockedattachments` is an environment-wide change, so ask first.
- "When Power Pages calls a flow" only appears for **solution-aware** flows. Create flows from Power Pages → Set up → Cloud flows, or inside the solution. Flows must be re-registered per environment.
- The cloud flow `eventData` key must equal the trigger input **title**. Calls need the `__RequestVerificationToken` and `X-Requested-With: XMLHttpRequest` headers.
- Contact has **Business Required custom columns from another project** (`rpn_quickbooksid`, `rpn_vendordisplayname`) in the Dev environment. Pass them empty when a flow creates contacts.
- Power Pages local sign-in posts to `/SignIn` with **`PasswordValue`**. Registration is a Web Forms page (copy ViewState and control names).
- `pac pages upload-code-site` wipes the **Header** web template. Keep redirect scripts in **Code-Site-Shell-Header**.
- **Changing an environment variable value behind a site setting (e.g. `BC/ClientSecret`) needs a site restart** (Power Platform admin center → Power Pages sites → Restart); the site keeps the cached old value otherwise (seen 2026-10-05). Server Logic reads site settings with `Server.SiteSetting.Get` (Microsoft Learn; the plugin's `Server.Sitesetting` is wrong), and a form-urlencoded `HttpClient.PostAsync` body must be a JSON object string (the platform encodes it).
- On Windows, the plugin's Node scripts call `az` without a shell (`az.cmd` fails); Git Bash also rewrites args that start with `/` (check `flowapiurl` in generated YAML).

## Don't

- Commit secrets, Postman collections with credentials, `.env` files, or the client's internal packages.
- Add Dataverse tables that duplicate BC data, or call BC from the browser.
- Change environment settings, site visibility, or production data without explicit approval.
- Redesign screens; build to the wireframe and flag gaps instead.

## Open decisions (check the architecture doc for status)

D1 pending-credit-approval orders in BC · D2 BC price-calculation endpoint · D3 service-center system (Dataverse vs D365 Customer Service) · D4 role on activation · Q6 Account & User Mgmt visibility per role · Q10 email on more than one BC customer (recommended: block) · Q11 APO Cement go-live date.

# Testing

- Vitest and React Testing Library for unit/integration tests
- Use Vitest an React Testing Library for pure functions, components, Server
  Action contracts, and regression tests.
- Colocate test files with the source file being tested.
- Avoid querying by CSS class, DOM structure, or test IDs unless there is no better accessible query.
- For a bug fix, first add a test that reproduces the failure when practical.
- Prefer `userEvent` over `fireEvent`.
- Use `findBy*` or `waitFor` for asynchronous UI updates.
- Mock external dependencies only when necessary.
- Do not mock the component being tested.
- Each test should be independent and should not rely on another test's state.
- Test important user flows, edge cases, loading states, error states, and empty states where applicable.
- Mock external boundaries, not the business rule being tested.
- Run proportionate checks: targeted tests while iterating, then `npm test`,
  `npm run lint`, `npm run build`, and relevant Playwright tests before handoff.
- Documentation-only edits require link/path checks, contradiction scans, and
  `git diff --check`; they do not require the runtime test suite.

# General Rules

- use mcp microsoft learn for latest documentation
- user the skills - vercel react best practices for react related code best practices
- use the power platform skills wherever it needed
