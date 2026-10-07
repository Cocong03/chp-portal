# S1 follow-up D — Activation messages, link expiry, forgot password, BC access block (design)

**Date:** 2026-10-06 · **Status:** Approved in chat (sections 1–3) · **Source:** `PLANS.md` requirements list · **Builds on:** sub-project C (`2026-10-04-s1-bc-activation-design.md`)

## Goal

Make activation and sign-in tell customers what is going on, without letting a stranger probe which emails exist; add a working, branded forgot-password journey; and let BC's `customerPortalAccess` flag switch a signed-in user off immediately.

## Decisions (2026-10-06)

| # | Requirement (PLANS.md) | Decision |
|---|---|---|
| 1 | Message when the email is on several portal-enabled customers | Flow returns `needs_help`; page shows a "contact the service center" card. Also used for the two contact conflicts |
| 2 | A used link can't activate again | Each new request cancels the contact's earlier unused invitations. Opening a used/expired/cancelled link shows the expired card **immediately** (no form) via a new "Check activation link" flow |
| 3 | Email pre-filled when setting the password | Activation link carries `&email=`; Set password shows it pre-filled and read-only |
| 4 | Access grant app auto-populates customer no. and email | **Out of scope** — keep the current app |
| 5 | Forgot password | Two new screens in the sign-in style; reset email delivered by a new flow through the Outlook connection (option B — no Dataverse email/server-side sync setup) |
| 6 | "Already activated" message | Flow returns `already_active`; page offers Sign in / Reset password |
| 7 | Block sign-in when BC `customerPortalAccess = false` | Live BC check on every request in `sessionScope` and `me` (option A); full-page "access turned off" card |
| — | Activation link lifetime | **24 hours** (was 7 days) |
| — | Spam cooldown (decided 2026-10-07) | If the contact has an unused invitation created in the last **10 minutes**, the flow sends nothing new and returns `ok` ("Check your email"). Stops strangers flooding a customer's inbox or cancelling their link. WAF rate limiting / CAPTCHA come at go-live (S1-14) |
| — | Email later added to a second customer (decided 2026-10-07) | **Sign-in stays allowed** for the customer the user was activated for (the access check only needs a portal-enabled contact linked to *their* customer). Q10 applies at activation only: a new activation request shows `needs_help` and notifies ops. The Phase 2 account switcher covers one login across several customers |
| — | Account enumeration ("middle ground") | Specific messages for several-customers, already-active and blocked; an email on **no** portal-enabled BC contact keeps the neutral "Check your email", so the page can't tell a stranger whether an address is a customer |

## 1. Activation (items 1, 2, 3, 6)

### Flow "Concreat Connect – Request activation" changes

- **Reply** `{"status": "<status>"}`:

  | Status | When |
  |---|---|
  | `ok` | Invitation sent; or the email is on no portal-enabled BC contact; or the input isn't an email |
  | `needs_help` | Several customers (Q10); several portal contacts share the email; contact already linked to another customer. The ops notice is still sent |
  | `already_active` | The matched portal contact has `adx_identity_username` set |

- **Cancel earlier links:** before creating the invitation, deactivate (`statecode` = 1) the contact's invitations that are unredeemed (`adx_redemptions` null or 0) and still active.
- **Expiry:** `adx_expirydate` = `addHours(utcNow(), 24)`.
- **Email:** link `{chp_SiteUrl}/activate/complete?code={code}&email={encodeUriComponent(email)}`; text "This link can be used once and expires in 24 hours."
- Technical failures still fail the run (the page shows "We couldn't send the activation email right now…").

### New flow "Concreat Connect – Check activation link"

- Trigger *When Power Pages calls a flow*, one text input titled **`Code`**; registered for **Anonymous Users**.
- List `adx_invitations` where `adx_invitationcode eq '<code, quotes doubled>' and statecode eq 0`, `$top 1`. Reply `{"status":"valid"}` when one is found, `adx_expirydate` is in the future, and `adx_redemptions` is null or below `adx_maximumredemptions`; otherwise `{"status":"invalid"}`. Malformed input → `invalid`.
- **Architecture rule 7 exception** (Power Automate on a synchronous read): recorded in `docs/Concreat_Hub_Architecture.md`. Reason: Server Logic would need anonymous read access to `adx_invitation`, which holds secret codes. The answer is a single bit about a 128-bit random code, so it reveals nothing useful.

### App

- `requestActivation(email)` returns the status (`'ok' | 'needs_help' | 'already_active'`); an unknown or missing status is treated as `ok`.
- **Activate page** after submit:
  - `ok` → existing "Check your email" card, text changed to "…expires in 24 hours."
  - `needs_help` → heading **"We couldn't activate this email automatically"**; body "This email address is linked to more than one Concreat customer account, so it needs to be set up by our team. Please contact the Concreat Customer Service Center at (02) 8849-3600." Link "Back to sign in".
  - `already_active` → heading **"Your account is already active"**; body "Sign in with your email and password. If you've forgotten your password, you can reset it."; buttons **Sign in** (`/`) and **Reset password** (`/forgot-password`).
- **Set password page** (`/activate/complete`):
  - On load, calls `checkActivationLink(code)` and shows "Checking your link…".
  - `invalid` (or no `code`) → only the existing expired card ("This activation link is invalid, has already been used, or has expired."). The form is never rendered.
  - `valid` → the form; email pre-filled from `?email=` and read-only. Without `?email=` the field stays editable (older links).
  - If the check itself fails (network/flow error) → show the form; Power Pages still rejects a used code on submit (existing handling).
- New env var `VITE_CHECK_LINK_FLOW_ID` in `.env.production`.

## 2. Forgot password (item 5)

### Screens (sign-in card style, `AuthLayout`)

- **`/forgot-password` — "Reset your password":** email field, **Send reset link**. Result card (neutral): "If this email has an active Concreat Connect account, we've sent a link to reset your password. The link expires in 1 hour." The 1-hour figure is Power Pages' default reset-token lifetime; confirm it while building and change the copy if it differs.
- **`/reset-password` — "Set a new password":** email pre-filled from the link and read-only; new password + confirm (`PasswordInput` with show/hide); **Save password**. Success → full reload to `/` (signed in) or to sign-in if Power Pages doesn't sign the user in. Used/expired link → "This reset link is invalid or has expired." with **Request a new link** (`/forgot-password`).
- Sign in's "Forgot password?" link and Activate's **Reset password** button go to `/forgot-password`.

### Behind the screens

- `requestPasswordReset(email)` posts to Power Pages' built-in `/Account/Login/ForgotPassword` (anti-forgery token + `Email`), the same technique as `signIn`.
- `resetPassword(userId, code, password, confirm)` posts to the built-in `/Account/Login/ResetPassword` form (copy its hidden fields and control names, as `redeemInvitation` does for Register). Error mapping: invalid/expired token → the expired card; password-rule errors → shown on the field.
- Site setting `Authentication/Registration/ResetPasswordEnabled` stays `true` (already set).

### New flow "Concreat Connect – Send password reset"

- Trigger: Dataverse *When a row is added* on **email**, filtered to rows whose subject contains "Password Reset" and whose regarding record is a contact (the email Power Pages' "Send Password Reset To Contact" process creates).
- Steps: read the contact's `emailaddress1` and `fullname`; extract the reset link from the email body (`href` containing `ResetPassword`); keep its `userId` and `code` query values; send **"Reset your Concreat Connect password"** through `chp_outlook` with a button to `{chp_SiteUrl}/reset-password?userId=…&code=…&email=…`, "This link expires in 1 hour.", "If you didn't ask for this, you can ignore this email.", and the support line; then mark the Dataverse email **Completed** so nothing sends it again.
- If the link can't be found, the run fails (visible in run history); nothing is sent.
- Solution-aware, in `ConcreatHub`, deployed by an idempotent script like `activation_flow.py`.

## 3. BC access block (item 7)

- **Rule:** a signed-in user may use the portal only while BC has a contact with their email, `customerPortalAccess = true`, linked (business relation `linktoTable eq 'Customer'`) to the customer of their active account.
- **`sessionScope`** (shared helpers, all BC endpoints): after resolving the account, GET `MCRMContacts` (`tolower(eMail) eq '<email>' and customerPortalAccess eq true`, `$select=companyNo`, `$top=20`), then `mcrmBusinessRelation` for those company nos (one OR filter, `linktoTable eq 'Customer'`, `$select=vendorNo`). The session's customer no. must be among the `vendorNo` values; otherwise throw a **blocked** error. The contact's email comes from Dataverse (`emailaddress1`), never from the request.
- **`respond`** maps a blocked error to a distinct customer-safe message, **"Your access to Concreat Connect has been turned off."**, so the SPA can tell it apart from a load failure. Other errors keep the existing message.
- **`me`** gains the helper block and runs the same check. Blocked → returns `{ contact, account: null, roles: [], blocked: true }` (200). A BC failure in `me` → the existing load error (not a block).
- **App:** `MeDto.blocked?: boolean`. `AppShell` shows a full-page card when `me.blocked` or when any `serverLogic` call fails with the blocked message: heading **"Your access has been turned off"**, body "Your access to Concreat Connect has been turned off. Please contact the Concreat Customer Service Center at (02) 8849-3600.", button **Sign out**.
- **Performance:** about two extra BC calls per request; measure on Dev and add a `ponytail:` note (upgrade: short-lived cache) where the check lives.

## Testing

- **Flow structure tests** (`test/flows`): request-activation statuses and branches, invitation cancel + 24 h expiry + email in link; check-link flow (statuses, quote doubling, anonymous-safe output); password-reset flow (trigger filter, link rewrite to `/reset-password`, marks email completed, no secrets).
- **Server Logic tests:** `sessionScope` allowed / flag false / linked to another customer / BC down; `me` blocked and BC-down cases; email taken from Dataverse, not the request.
- **App tests (RTL):** Activate's three outcomes; Set password checking → invalid card without form, valid with read-only pre-filled email, check failure → form; Forgot password and Reset password screens incl. expired link; blocked card from `me` and from a data call.
- **Live on Dev:** each activation status; used link → expired card on open; 24 h expiry date set; forgot-password email arrives branded, new password works, old link rejected; flag false → blocked card, flag true → access back.

## Out of scope

Access grant app changes (item 4); caching the BC access check; APO Cement (S1-12); UAT/Prod moves (S1-14 — add the two new flows and their Outlook connection to its list).
