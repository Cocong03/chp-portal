# Service center sync (monday.com)

Plan task S4-07. The service center works out of two monday.com boards, Requests and Complaints & Feedback. The portal sends new submissions there, and the status the team sets on the board comes back to the portal. Customers never see the name of the service center tool. It only appears in our flows and settings.

## The four flows

| Flow | When it runs | What it does |
|---|---|---|
| Send request to service center | a request row is created or re-queued (sync state Pending, no item yet) | creates the board item with all the columns, uploads the attachment, writes the item id back and sets Sent. On an error it sets Failed with the reason |
| Send complaint to service center | same, for complaints | same |
| Service center status webhook | monday calls it when a **Status** column changes | re-reads that one item from monday and writes the status (and the resolved date) back to the row |
| Sync with service center | every hour | catches anything the webhook missed, and re-sends Failed or stuck Pending rows |

A few details that matter:

- The send flows look for an existing item with the same reference before creating one, so a retry never makes a duplicate.
- The webhook flow never trusts the payload for the status itself. It only takes the board and item ids from it, then reads the item back from monday.
- "Resolved" also sets the date resolved, in Manila time.
- Category, request type and complaint type go to dropdown columns. If the portal sends a value the dropdown doesn't list yet, monday adds it rather than rejecting the item. The service center team moved Category and Request Type to dropdowns on Oct 28.

## Settings

All environment-specific values are environment variables. The flows have nothing hardcoded.

| Variable | What it is |
|---|---|
| `chp_MondayApiUrl` | the monday API endpoint |
| `chp_MondayRequestsBoardId`, `chp_MondayComplaintsBoardId` | the two board ids |
| `chp_MondayRequestsColumns`, `chp_MondayComplaintsColumns` | JSON maps from our field names to the board's column ids and types |
| `chp_MondayAPIToken` | the API token. Set by hand only, never stored in a file |

If the service center team changes a column on a board, the column id usually changes with it. Update the column map variable, then turn the two send flows off and on so they pick up the new value. That's what happened when Category moved to a dropdown.

## Webhooks

Each board needs one webhook pointing at the webhook flow's trigger URL. It should be set to "when a specific column changes" on the Status column only, so edits to other columns don't start the flow.

- **Dev:** registered 2026-10-29 with `monday_webhooks.py --add`. The boards also carry the reco environment's hooks, so each status change runs both environments' webhook flows; each only updates its own rows.
- **Shared boards:** the send flows reuse an existing item with the same reference. Two environments on the same boards must use different reference ranges, or one links to the other's items. Our Dev's autonumber seed starts at 20000 (RQ-20000, CMP-20000).
- **A new environment:** it has its own trigger URL, so the webhooks have to be registered again. The URL carries its own signature, so treat it like a password. There are two ways:
  - `scripts/dataverse/monday_webhooks.py` gets the URL from the flow and registers it on both boards. It needs a token with permission to add webhooks, and it only runs against the dev org unless you change the check at the top.
  - Or someone with board admin rights adds them in monday: Integrate → Webhooks → "When a column changes" → Status, then paste the URL.

## How long it takes

Status changes showed up in Dataverse in about 4–9 seconds in testing. The Requests and Complaints pages re-check every 30 seconds while they're open, so a customer sees the change within half a minute without reloading.

## Open points

- The hourly re-send has no attempt cap. If a submission keeps failing (for example monday rejecting an attachment), it gets retried every hour. Worth adding a max-attempts stop if that ever shows up.
- Test items from Dev testing (RQ-01004 onwards, CMP-01004 onwards) are still on the boards and can be cleared.
