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
