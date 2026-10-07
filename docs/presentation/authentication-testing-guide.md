# Concreat Connect: Authentication Testing Guide

This guide covers what to test, how to test it, and what to expect. It applies to the **Dev** environment, and every check below passed there between 2026-10-04 and 2026-10-07.

It covers:
- sign-in;
- account activation, including the "multiple accounts" and "already active" outcomes and link expiry;
- forgot password;
- the BC access block;
- access grants.

---

## 1. Before you start

### Environment

| Item | Dev value |
|---|---|
| Portal | https://chp-portal-dev.powerappsportals.com (private site; sign in to Power Pages first if asked) |
| Power Platform environment | CHP Customer Portal (`org380257ac`) |
| Business Central | Environment `DEV`, company SOLID CEMENT CORPORATION |
| Admin app | Concreat Connect Admin (access grants) |
| Flows (solution ConcreatHub) | Request activation · Check activation link · Send password reset · Apply access grant |

### Test accounts (Dev only)

| Email | Password | Web role | Note |
|---|---|---|---|
| `full@example.com` | `Concreat#2026dev` | Full Access | No BC contact, so it now shows the **access turned off** card (see §6) |
| `orders@example.com` | same | Orders & Delivery | Same as above |
| `finance@example.com` | same | Finance & Documents | Same as above |
| `viewonly@example.com` | same | View Only | Same as above |
| `norole@example.com` | same | none | Same as above |

`@example.com` addresses never receive mail. For anything that sends an email, use a mailbox you can read, for example `you+test1@yourdomain.com` (plus-addressing) or a personal Gmail.

### How the portal decides who a customer is (BC rules)

- **The portal matches a BC contact's email, not the customer card's email.** In BC, changing the customer card's Email also updates the **company contact** and the **primary contact person** (standard BC sync). That's why one edit can give an email two contacts.
- **Only contacts with `customerPortalAccess = true` count.**
- **A contact leads to a customer through Business Relations** (`mcrmBusinessRelation`, Link to Table = Customer). The customer number is in the field named `vendorNo`.
- **One email, one customer, any number of contacts:** treated as **one customer**. Normal.
- **Different emails, same customer:** **separate portal users** on the same customer account. Normal.
- **One email on two or more customers:** "multiple accounts". Activation is blocked and ops is notified.

### Checking BC data with Postman

Use the BC team's collection: **Contacts → Contacts - Read**.
- `$filter`: `eMail eq '<email>'`
- `$select`: `id,name,eMail,no,companyNo,customerPortalAccess`

Make sure the result is what the test needs: the right flag values, and one customer or several.

---

## 2. Sign in

| # | Steps | Expected |
|---|---|---|
| 2.1 | Open the portal while signed out | **Sign in to Concreat Connect** |
| 2.2 | Enter a wrong password | **Incorrect email or password. Please try again.** |
| 2.3 | Sign in with an activated user who has a role and BC access | The portal opens, showing only the sections allowed for that role |
| 2.4 | Sign in with an activated user who has **no role** | **Your portal access is being set up** (no section menus) |
| 2.5 | Click **Forgot password?** | Goes to **Reset your password** (§5) |
| 2.6 | Click **Activate your account** | Goes to **Activate your account** (§3) |

---

## 3. Activation: the three outcomes

Open `/activate`, enter an email, and click **Send activation link**.

| # | BC setup for the email | Expected page | Side effects |
|---|---|---|---|
| 3.1 | **Not on any portal-enabled contact**, including unknown emails and contacts with access `false` | **Check your email**: "…The link can be used once and expires in 24 hours." | Nothing is created or sent. The page is deliberately neutral, so it can't be used to find out which emails are customers |
| 3.2 | Portal-enabled on **one customer**, never activated | **Check your email** | An Account, a Contact and an Account Link are created (or reused); an invitation valid for 24 hours; the activation email **"Activate your Concreat Connect account"** |
| 3.3 | Portal-enabled on **two or more customers** | **We couldn't activate this email automatically**: "This email address is linked to more than one Concreat customer account, so it needs to be set up by our team. Please contact the Concreat Customer Service Center at (02) 8849-3600." | No invitation. Ops notice **"Concreat Connect: activation blocked — email on several customers"** to the sender mailbox, listing the customer numbers |
| 3.4 | One customer, **already activated** | **Your account is already active**, with **Sign in** and **Reset password** buttons | No new invitation |
| 3.5 | Email typed in mixed case or with spaces, e.g. `  Name@Domain.COM ` | Same result as the lower-case email | No duplicate contact or account |

**How to set up 3.3:** in BC, give the same email to a portal-enabled contact of a **second** customer, then check with Postman that it now reaches two customers.

---

## 4. Activation link and Set password

**Setup:** use an email as in 3.2 (one customer, not activated, a mailbox you can read).

| # | Steps | Expected |
|---|---|---|
| 4.1 | Request activation, wait **more than 10 minutes**, then request again | Two activation emails arrive. A second request **within 10 minutes** sends nothing new (spam cooldown; the page still says "Check your email") |
| 4.2 | Open the **older** email's link | "Checking your link…", then **This link has expired**: "This activation link is invalid, has already been used, or has expired." **No password form** |
| 4.3 | Open the **newer** email's link | **Set your password**, with the **email pre-filled and read-only** |
| 4.4 | Try a weak password (e.g. `Ab1!`) | **Use at least 8 characters.** |
| 4.5 | Set a valid password (8+ characters, three of: upper, lower, number, symbol) | Signed in and taken to the portal |
| 4.6 | Open the same link again | **This link has expired**, shown immediately |
| 4.7 | Open a link more than 24 hours old | **This link has expired** |

**Dataverse check (optional):**
- **Portal Management → Invitations:** only the newest invitation for the contact is Active; older unused ones are Inactive; the expiry is about 24 hours after creation.
- **The contact:** "Email confirmed" is **Yes** (activation sets it; password reset needs it).

---

## 5. Forgot password

| # | Steps | Expected |
|---|---|---|
| 5.1 | On **Sign in**, click **Forgot password?**, then enter an activated user's email (a mailbox you can read) | **Check your email**: "If this email has an active Concreat Connect account, we've sent a link to reset your password. The link expires in 1 hour." |
| 5.2 | Enter an unknown email | The same **Check your email** text (neutral) |
| 5.3 | Open the email **"Reset your Concreat Connect password"** and click **Reset your password** | **Set a new password**, with the email shown read-only |
| 5.4 | Set a new password | **Your password has been reset** → **Sign in** works with the new password |
| 5.5 | Open the same reset link again | **This link has expired**: "This reset link is invalid or has expired." with **Request a new link** |

**Behind the scenes:**
- Power Pages creates its own "Password Reset" email in Dataverse.
- The **Send password reset** flow sends the branded email instead.
- It then sets the Dataverse email to **Canceled**, so it's never sent.

---

## 6. BC access block (`customerPortalAccess`)

The rule: a signed-in user keeps access while **at least one** BC contact with **their email** and `customerPortalAccess = true` is linked to **their customer**. It's checked live on every page load and every data call.

| # | BC change | Expected |
|---|---|---|
| 6.1 | Set `customerPortalAccess = false` on **every** contact with the user's email for their customer (e.g. both the company contact and the person contact), then reload the portal | **Your access has been turned off**: "Your access to Concreat Connect has been turned off. Please contact the Concreat Customer Service Center at (02) 8849-3600." Only a **Sign out** button; no menus, no data |
| 6.2 | Set **one** of those contacts back to `true`, then reload | The portal comes back |
| 6.3 | Turn off only **one** of two portal-enabled contacts | **Still allowed** (one enabled contact is enough) |
| 6.4 | An activated user whose email is **later** added to a second customer | **Still allowed** for the customer they were activated for (decided 2026-10-07). A new activation request for that email shows "We couldn't activate this email automatically" |

---

## 7. Access grants (pre-assigned roles)

| # | Steps | Expected |
|---|---|---|
| 7.1 | In **Concreat Connect Admin**, create a grant (email, BC customer no., web role) **before** the person activates | Status **Pending** |
| 7.2 | The person activates (§3–4) | The grant changes to **Applied** and the role is on the contact; after signing in, the person sees that role's sections |
| 7.3 | Create a grant for an email that is **already activated** on that customer | **Applied** straight away |
| 7.4 | Create a grant whose customer no. differs from the contact's customer | **Customer mismatch**, and no role is given |

---

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| "We couldn't send the activation email right now…" | Power Automate → **Request activation** → run history. A failed token step usually means the BC client secret is wrong |
| Data pages fail after changing an environment variable (e.g. the BC secret) | **Restart the site** (Power Platform admin center → Power Pages sites → Restart). The site keeps the old value until then |
| A Server Logic call fails with a generic error | Edge + the **Power Pages DevTools** extension → **Website Traces**; the `… failed:` row names the step and Microsoft's error code |
| No password reset email | The contact's **Email confirmed** must be Yes, and the contact owner must allow **send on behalf** (Personal options → Email) |
| A reset link shows the server error page | Request a new reset; only links from the newest email work |
| Activation email never arrives | Check Junk; check the flow run reached **Send_activation_email**; check BC that the contact has access `true` on **one** customer |
| The access block doesn't trigger | Every contact with that email for the customer must be `false` (one `true` is enough to allow access) |

---

## 9. Not covered yet

- **UAT/Prod setup (task S1-14):**
  - the BC secret moves to Key Vault;
  - flow connections and the reset "from" user move to a service account with **send on behalf** enabled;
  - flows are re-registered in each environment.
- **Signing in to several customers with one email:** the Phase 2 account switcher.
- **The access grant app auto-filling the customer no. and email:** out of scope by decision.
