# Portal access runbook (CHP ops)

Who can sign in to Concreat Connect, and what they see, is managed in Dataverse — never in BC (decided 2026-09-15).

**Who may sign in at all** is BC's **Customer Portal Access** flag on the customer's **person** contact (one per named user, with their own email). The flag on a **company** contact is ignored (decided 2026-10-09): a shared company email can't be used to activate or sign in. Turning the flag off on the person contact blocks them on their next page load.

## What each role sees

| Web role | Sections |
|---|---|
| Full Access | Dashboard, Delivery Sites, Orders, Customer Ledger, Document Center, Requests, Complaints & Feedback, Account and User Management |
| Orders & Delivery | Dashboard, Delivery Sites, Orders, Requests, Account and User Management |
| Finance & Documents | Dashboard, Customer Ledger, Document Center, Account and User Management |
| View Only | Dashboard, Account and User Management |

Activating a portal account gives **no** role unless an access grant exists for that email and customer (decision D4 default). Until a role is given, the contact sees "Your portal access is being set up".

## Give, change or remove a role — only in Concreat Connect Admin

The **access grant is the source of truth** for each person's portal role (decided 2026-10-08). Don't add or remove web roles in Portal Management: the next change to the grant overwrites them.

**Give a role** (before or after the person activates)

1. Open **Concreat Connect Admin** → **Access Grants** → **New**.
2. Enter the **email**, the BC **customer no.** and the **role**, then **Save**.

**Change a role:** open the grant, pick the new **Role**, **Save**. The old role is removed and the new one applied.

**Remove access** (for example, someone left the company): open the grant and click **Deactivate**. All their portal roles are removed and Status becomes **Revoked**. They can still sign in but see "Your portal access is being set up". To restore access, open the grant from the **Inactive Access Grants** view and click **Activate**.

Grants can't be deleted (a deleted grant can't tell the portal whose role to remove). Deactivate instead; the grant stays as a record of who had access.

Changes apply within about a minute, on the person's next page load.

**Status**

- **Applied:** the person has a portal account on that customer and now has exactly this role.
- **Pending:** no portal account with that email yet; the role is applied when they activate.
- **Revoked:** the grant was deactivated; the person has no portal role.
- **Customer mismatch:** a portal account with that email exists on a different customer. Nothing was changed; check the email and customer no.
- **Duplicate email:** two contacts share the email; they can't sign in until one is fixed. Ask the portal team.

To stop someone signing in at all, deactivate their **Contact** as well (Portal Management, portal team).

**Need it to take effect immediately** (e.g. a dismissed employee)? Turn off **Customer Portal Access** on their person contact in BC: the portal checks it live on every request, so an open session is blocked on its next page load. Deactivating the grant or the Contact can take up to 15 minutes to reach a session that's already signed in (Power Pages caches Dataverse data).

## Who can use Concreat Connect Admin

CHP IT gives the staff member the **Basic User** and **Concreat Connect Admin** security roles and a Power Apps license.

## Dashboard announcement

1. Open **Concreat Connect Admin** → **Announcements** → **New**.
2. Enter a **Title** and **Message**, set **Active** to **Yes**, then **Save**.
3. Every signed-in customer sees it at the top of the Dashboard within 5 minutes. If several are active, the most recently changed one is shown.
4. To remove it, set **Active** to **No** (or delete the record). With no active announcement, no banner is shown.
