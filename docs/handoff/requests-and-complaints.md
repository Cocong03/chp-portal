# Requests and Complaints & Feedback

Plan tasks S4-01 to S4-05. Both tabs follow the wireframe: a list of what the customer has already sent, a detail view, and a form to send a new one.

## Who sees what

| Tab | Web roles |
|---|---|
| Requests | Full Access, Orders & Delivery |
| Complaints & Feedback | Full Access |

The same roles are set on the Server Logic records and the table permissions, so hiding the tab is only the visible part.

## How it fits together

```
Page (src/modules/requests, src/modules/complaints)
  -> Server Logic: requests / complaints
      -> Dataverse: chp_request / chp_complaint (+ note for the attachment)
          -> service center flows (see service-center-sync.md)
```

- **Lists.** Only rows for the signed-in customer's account come back. The account is always taken from the session, never from the request.
- **Forms.** The category list drives the type list, and the type decides the assigned group and which extra fields appear:
  - sales order
  - trip ID
  - delivery site
  - document reference and date
  - affected user email
  
  The categories and types come from `chp_requesttype` and `chp_complainttype`, so the business can change them without a deploy.
- **Checks on submit.** The endpoint re-checks everything server-side:
  - A sales order number has to be one of the customer's own orders in BC.
  - A delivery site has to be one of their ship-to codes.
  - The type has to exist and be active.
  
  The page never decides the assigned group; the type record does.
- **Attachments.** One file per submission, up to 5 MB, stored as a note on the row. Requests accept PDF, Word, Excel and images (png, jpg, gif, webp). Complaints accept the same minus Excel.
- **Contact.** Email or mobile. Email is prefilled from the user's contact. Mobile accepts PH formats (`0917 552 6613`, `+639175526613`).
- **References.** `RQ-#####` and `CMP-#####` come from autonumber columns on the tables.

## Tables (solution `ConcreatHubRequests`)

| Table | Holds |
|---|---|
| `chp_request` | one row per request: account, contact, category, type, assigned group, details, the extra fields as JSON in `chp_fields`, contact method/value, status, service center item id, sync state |
| `chp_complaint` | the same idea for complaints, plus subject, incident date, delivery site, related order and consent |
| `chp_requesttype`, `chp_complainttype` | the category > type > assigned group list, with an active flag and sort order. For requests, `chp_fieldconfig` says which extra fields a category needs |

Status is Submitted, In Review or Resolved. Sync state is Pending, Sent or Failed. Both are choices on the row.

## Table permissions

- **Own account, read and create.** Account scope through the account relationship. No write and no delete for customers.
- **Notes, create.** Parent scope under the row's permission, so a note can only hang off the customer's own row.
- **Types, read.** Global read, because it's only the dropdown list.

The permission tests in `test/server-logic/permissions.test.ts` pin these down.

## Tests

- Unit:
  - endpoints in `test/server-logic/requests.test.ts` and `complaints.test.ts`
  - the forms and pages next to their components
- End to end: `e2e/requests-complaints.spec.ts`. It submits real rows on Dev, which also creates real items on the service center boards. Find them by the `E2E <timestamp>` text.

## Open points

- The five request categories that were moved to Phase 2 (Adjustment, Customer Account, Sample Request, Account Receivables, Technical Client Visit) are in the type table but their extra fields aren't on the form yet.
- The Delivery request needs a customer with BC orders to test end to end. The Dev test customer has none, so that e2e case skips.
