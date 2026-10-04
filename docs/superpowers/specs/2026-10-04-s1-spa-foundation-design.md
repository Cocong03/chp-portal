# S1 Sub-project A — SPA Foundation (Design)

**Date:** 2026-10-04 · **Plan tasks:** S1-08, S1-09, S1-10, S1-11 (plus the sign-in screens that S1-01 did not port)
**Order:** A (this) → B (identity/auth in Dev: S1-02, S1-04, S1-05, S1-07) → C (BC-connected: S1-06, S1-03)

## Goal

Give every module a working shell to build into: sign-in screens, a session-aware AppShell with role-filtered navigation, in-portal help, and one Server Logic caller that serves mock data on localhost. Done when a developer can run `npm run dev`, sign in as any mock role, and see the right nav, help and placeholder pages. The modules then plug in behind the same `api/` functions.

## Decisions (2026-10-04)

| Topic | Decision |
|---|---|
| Customer-facing name | **Concreat Connect** (wireframe). CLAUDE.md and DESIGN.md updated. `ConcreatHub` stays only in internal identifiers |
| Sign-in screens | **Rebuild** to the wireframe, not a POC copy. Keep the POC's proven Power Pages mechanics |
| Mock data | Only `me` now. Each S2/S3 module adds its own DTO type + fixture when built |
| Forgot password | Link to Power Pages' built-in `/Account/Login/ForgotPassword`. SPA screens later if needed |
| Session/data approach | `Portal.User` for signed-in vs anonymous; `me` Server Logic for account + roles; plain fixture map for mocks (no MSW) |
| Account and User Management visibility | All roles (Q6 recommendation, pending Rene) |
| Signed-in user with no business role (D4 default) | One "access being set up" page instead of the shell sections |

## Files

```
src/
  api/serverLogic.ts    serverLogic<T>(name, { method?, query?, body? })
  api/types.ts          MeDto
  mocks/index.ts        mock responses by endpoint name; `me` picks a fixture by mock email
  auth/session.ts       getPortalUser, signIn, redeemInvitation, requestActivation, signOut, fetchAntiForgeryToken
  auth/useMe.ts         TanStack Query over serverLogic('me')
  auth/access.ts        ROLE_SECTIONS + canSee(roles, sectionKey)
  layout/sections.ts    the 8 sections: { key, path, label, help }
  layout/AppShell.tsx   topbar + nav + <Outlet/>, loading/error/no-role states
  layout/HelpDialog.tsx
  modules/signin/       AuthLayout, SignIn, Activate, SetPassword
  modules/Placeholder.tsx
  ui/                   shadcn dialog, dropdown-menu, avatar, input, label, badge; PageHeader, Logo
  lib/usePageTitle.ts   document.title = "<Page> — Concreat Connect"
docs/wording-checklist.md   renames applied (input to S5-04)
```

## API layer

**`serverLogic<T>(name, { method = 'GET', query, body })`**
- On localhost/127.0.0.1, it returns `mocks[name]` (a function of the request) after a short delay. An unknown name throws `ApiError(404)`.
- When deployed, it calls `fetch('/_api/serverlogics/<name>?<query>')` with `credentials: 'same-origin'`.
  - Non-GET requests send `__RequestVerificationToken` (from `/_layout/tokenhtml`) and `X-Requested-With: XMLHttpRequest`.
  - Bodies are sent as JSON.
  - Implementation checks Microsoft Learn for the exact Server Logic request/response contract (token on GET, response envelope) and adapts this caller to match.
- A non-2xx response throws `ApiError { status, message }`. The message comes from the response's error envelope when present, otherwise from generic copy.

**`MeDto`**
```ts
interface MeDto {
  contact: { name: string; email: string }
  account: { customerNo: string; customerName: string; company: string } // company = "Solid Cement" | "APO Cement"
  roles: string[] // web role names; business roles: Full Access, Orders & Delivery, Finance & Documents, View Only
}
```
Field names follow the wireframe (`ACCOUNTS[].customerNo/customerName/company`, `CURRENT_USER.name`).

**Mock `me`.** The mock is chosen by the email used at mock sign-in. Each mock user carries the wireframe sample account (Solid Cement · 10482 · J.D. Santos Hardware & Construction Supply).

| Email | Roles |
|---|---|
| `full@test.ph` (and any unknown email) | Full Access |
| `orders@test.ph` | Orders & Delivery |
| `finance@test.ph` | Finance & Documents |
| `viewonly@test.ph` | View Only |
| `norole@test.ph` | none (only Authenticated Users) |

## Session (`auth/session.ts`)

This file is rebuilt from the POC's Power Pages mechanics (Registration doc §4.1, §5):

- **`getPortalUser()`**
  - Deployed: reads `window.Microsoft.Dynamic365.Portal.User` and treats an empty `userName` as anonymous.
  - Localhost: reads a sessionStorage mock session.
- **`signIn(email, password)`**
  - POSTs `application/x-www-form-urlencoded` to `/SignIn` with `__RequestVerificationToken`, `Email`, `PasswordValue` and `ReturnUrl=/`.
  - Success: the response lands on `ReturnUrl`, then a full reload follows so `Portal.User` is populated.
  - Otherwise: parses `.validation-summary-errors li, .alert-danger li, .field-validation-error` and throws them.
  - Localhost: stores the mock session and reloads.
- **`redeemInvitation(code, email, password, confirm)`**
  - GETs `/Account/Login/Register?invitationCode=…&returnUrl=/`.
  - Copies the hidden fields (`__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`, the token) and the control names for `EmailTextBox`, `PasswordTextBox`, `ConfirmPasswordTextBox` and `SubmitButton`.
  - POSTs the form back to its resolved action.
  - If the `Register` form is missing, throws "This activation link is invalid or has expired." Server errors are parsed as for sign-in.
- **`requestActivation(email)`**
  - POSTs `/_api/cloudflow/v1.0/trigger/<flowId>` with `{ eventData: JSON.stringify({ Email }) }` and the CSRF headers.
  - The flow ID comes from `import.meta.env.VITE_ACTIVATION_FLOW_ID`, set in C. Until then it is mocked on localhost and throws a generic error when deployed.
- **`signOut()`** goes to `/Account/Login/LogOff?returnUrl=/`. On localhost it clears the mock session.

## Routing

`main.tsx` reads `getPortalUser()` once.

**Anonymous**

| Path | Screen |
|---|---|
| `/` | SignIn |
| `/activate` | Activate |
| `/activate/complete?code=` | SetPassword |
| anything else | → `/` |

**Signed in:** the AppShell, with lazy routes from `sections.ts`.

| Path | Section |
|---|---|
| `/` | Dashboard |
| `/sites` | Delivery Sites |
| `/orders` | Orders |
| `/ledger` | Customer Ledger |
| `/documents` | Document Center |
| `/requests` | Requests |
| `/complaints` | Complaints & Feedback |
| `/account` | Account and User Management |

- `/activate*` → `/`.
- A path whose section the role can't see → `/`. This guard is UX only; Server Logic web roles (B) are the security.
- With no business role, every path shows the no-role page: *"Your portal access is being set up. Contact your account manager or the Concreat Customer Service Center at (02) 8849-3600."*

## Access map (`auth/access.ts`)

| Role | Sections |
|---|---|
| Full Access | Dashboard, Orders, Customer Ledger, Document Center, Delivery Sites, Complaints & Feedback, Requests, Account |
| Orders & Delivery | Dashboard, Orders, Delivery Sites, Requests, Account |
| Finance & Documents | Dashboard, Customer Ledger, Document Center, Account |
| View Only | Dashboard, Account |

- The map comes from the wireframe's `PORTAL_ROLE_PAGES`, plus Account for every role (Q6).
- A user with several roles sees the union of their sections.
- Unknown role names, such as Authenticated Users, are ignored.

## Screens

### AuthLayout (DESIGN.md §7)

- **Fixed brand palette.** Add `--brand-*` tokens to `theme.css`; these screens don't switch to dark mode.
- **Left panel.** Copy is word for word from the wireframe:
  - logo row "CONCREAT"
  - eyebrow "Welcome to" and heading "Concreat Connect"
  - tagline "One hub for every order." and the lede
  - three features (Lucide icons)
  - APO / RIZAL / ISLAND brand chips
- **Right panel.** Navy gradient with a centred white card.

### SignIn (wireframe copy)

- Card title "Sign in to Concreat Connect" and sub "Use the access details provided for your customer account."
- Fields: "User ID or email" and "Password". The "Forgot password?" link goes to `/Account/Login/ForgotPassword`.
- "Sign in" button, then "Activate your account" (→ `/activate`).
- Activation note, legal line and support line. "Terms of Use" and "Data Privacy Policy" link to `#` until the client supplies the pages.
- React Hook Form + Zod with required fields only ("Enter your user ID or email." / "Enter your password."). A server error shows above the button, and the button reads "Signing in…" and is disabled while submitting.

### Activate (no wireframe; copy pending client review)

Same AuthLayout and card. The footer repeats the wireframe's activation note ("For existing Concreat Holdings customers only — new accounts are set up by your account manager.") and support line.

| State | Copy |
|---|---|
| Title | **Activate your account** |
| Sub | Enter the email address registered to your customer account. We'll email you a link to set your password. |
| Field | Label "Email address", placeholder "name@company.com" |
| Validation | "Enter your email address." · "Enter a valid email address." |
| Button | "Send activation link" (submitting: "Sending…") |
| Below button | "Already activated? Sign in" (→ `/`) |
| Success title | **Check your email** |
| Success body | If **{email}** is registered to a Concreat Holdings customer account, we've sent an activation link to it. The link can be used once and expires in 7 days. |
| Success help | Didn't get it? Check your spam or junk folder, or contact the **Concreat Customer Service Center** at **(02) 8849-3600**. |
| Success link | "Back to sign in" |
| Send failed | We couldn't send the activation email right now. Please try again in a few minutes. |

The success state is shown for every accepted email, whether or not it matches a customer and whether or not it was already activated. The screen never reveals which emails exist.

### SetPassword (no wireframe; copy pending client review)

Route `/activate/complete?code=`. Same AuthLayout and card.

| State | Copy |
|---|---|
| Title | **Set your password** |
| Sub | Create a password to finish activating your Concreat Connect account. |
| Fields | "Email address" (hint: "The email address the activation link was sent to."), "Password", "Confirm password" |
| Password hint | At least 8 characters, using three of these: uppercase letters, lowercase letters, numbers, symbols. |
| Validation | "Enter your email address." · "Enter a valid email address." · "Enter a password." · "Use at least 8 characters." · "Use at least three of: uppercase letters, lowercase letters, numbers, symbols." · "Passwords don't match." |
| Button | "Activate account" (submitting: "Activating…") |
| Server errors | Shown above the button as Power Pages returns them |
| Fallback error | We couldn't activate your account. Please try again, or contact the Concreat Customer Service Center at (02) 8849-3600. |
| Missing or invalid code | Title **This link has expired**. Body: "This activation link is invalid, has already been used, or has expired." Button "Request a new link" (→ `/activate`) |

- On success Power Pages signs the user in and redirects to `/`, which shows the Dashboard.
- The Zod rules mirror Power Pages' default policy (`PasswordValidator/EnforcePasswordPolicy` = true, `RequiredLength` = 8; Microsoft Learn, "Local authentication, registration, and other settings"). If B changes those site settings, update the hint and the schema together.

### AppShell (DESIGN.md §4)

- **Topbar left:** the `Logo` ring, "Concreat Connect" and "Customer Portal".
- **Topbar right:**
  - a "? Help" ghost button
  - "Viewing **{company}** · {customerName}"
  - an Avatar with initials from `contact.name`, in a DropdownMenu that has only **Sign out**
- **Nav:** `NavLink` pills in wireframe order, filtered by `canSee`. The active pill uses the accent background and the 3px glowing underline.
- **Loading:** skeleton topbar and nav while `me` loads.
- **Error:** inline error with **Retry** if `me` fails.

### Placeholder

- `PageHeader` with the section label and "This section is coming soon."
- `usePageTitle(label)`.

### HelpDialog (S1-10)

- shadcn Dialog titled "Getting around Concreat Connect".
- Caption: "A quick guide to what each section of the portal is for."
- Lists the 8 blurbs from `sections.ts`, copied word for word from the wireframe help modal, regardless of role (as in the wireframe).
- Opened from the topbar on every page.

### Wording (S1-11)

- Labels and help text live only in `sections.ts`.
- `docs/wording-checklist.md` records the renames applied ("Account and User Management", "Concreat Connect") for S5-04.

## Testing

Vitest + RTL, colocated, `userEvent`, accessible queries.

- `auth/access.test.ts`
  - each role's exact section set
  - the union of several roles
  - only unknown roles → no sections
- `api/serverLogic.test.ts`
  - the mock path returns the fixture
  - deployed GET calls the right URL
  - POST sends the CSRF headers
  - non-2xx throws `ApiError` with the envelope message
- `layout/AppShell.test.tsx`
  - nav per role
  - forbidden direct URL redirects to Dashboard
  - no-role page
  - Help dialog lists all 8 topics
  - loading and error + Retry
  - active link marked `aria-current="page"`
- `modules/signin/SignIn.test.tsx`
  - required-field errors
  - a server error is shown
  - mock sign-in stores the session
- `modules/signin/SetPassword.test.tsx`
  - password policy (length, three of four character types) and mismatched passwords
  - missing-code state

**Handoff:** `npm test`, `npm run lint`, `npm run build`, then a manual `npm run dev` pass signing in as each mock role.

## Out of scope

- Real `me` Server Logic, auth site settings, Code-Site-Shell-Header and web roles (sub-project B)
- Activation flow and its ID (C)
- Profile page and SPA forgot/reset screens
- Account switcher (Phase 2)
- Module content (S2+)

Until B ships `me`, the deployed site shows the `me` error state after sign-in. A is verified on localhost.

## Open items for the client

- Review the Activate and SetPassword copy above (no wireframe)
- Terms of Use / Data Privacy Policy pages (links are `#` until supplied)
- Q6 (Account section for all roles)
- D4 (no-role page wording)
