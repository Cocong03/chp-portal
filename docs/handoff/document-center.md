# Document Center

Plan tasks S2-16 and S2-17. The customer's posted documents, read live from Business Central. Nothing is copied into Dataverse.

Visible to **Full Access** and **Finance & Documents**.

## What the page does

Built to the wireframe:

- Lists every posted document on the account, newest first: Invoice, Credit Memo, Acknowledgement Receipt (a BC payment) and Delivery Receipt (a posted warehouse shipment).
- Filters by type and by date range, and searches by reference no., SO no. or PO reference.
- Shows 10 per page, with the count above the table.
- Has a **Download** button per row for that document's PDF. BC takes 5–12 seconds to render one, so the button shows "Preparing…" while it waits, and other rows stay usable.
- Exports the filtered list with **CSV / Excel** (`Documents-YYYY-MM-DD.xlsx`), the same way the Orders export works.

A delivery receipt has no amount of its own, so that column shows "—". Prepayment invoices and payments have no SO number, which also shows as "—".

## Endpoints

| Server Logic | What it does |
|---|---|
| `documents` (GET) | Reads BC `portalDocuments` for the session's customer. Type, dates and paging all happen in BC. Search runs three queries (document no., SO no., PO reference) and merges them, because BC can't "or" across fields. `all=true` returns everything for the export. |
| `document-file` (GET) | First checks the document is the session customer's (a lookup in `portalDocuments`). Only then does it ask BC `portalDocumentPdfs` for the PDF (a POST with customer no., type and document no.) and return `{ fileName, contentType, base64 }`. The customer number always comes from the session. BC also refuses another customer's document on its own. |

The type names on screen ("Delivery Receipt") are what the PDF call expects. The list filter uses BC's enum form (`Delivery_x0020_Receipt`). Both endpoints handle that.

A 450 KB PDF answer comes back through Server Logic without any problem. The default Server Logic timeout is 120 seconds, well above BC's render time.

## Tests

- Unit:
  - `test/server-logic/documents.test.ts` and `document-file.test.ts`
  - the page and download helper tests in `src/modules/documents`
- End to end: `e2e/documents.spec.ts` covers:
  - the list
  - the type filter
  - search by SO
  - a PDF download, checking that the file really is a PDF
  - the Excel export
  - the cross-check that an invoice's SO shows up on Orders and its number on the Ledger

## Not done yet

- **Statement of Account.** The wireframe has a card for it (From/To dates, then "Generate & download PDF"), but it isn't in the plan or the Monday.com tasks, and BC has no API for it. We've asked the BC team for one based on BC's standard Customer Statement report (`customerNo`, `fromDate`, `toDate` → `fileName`, `pdfBase64`) and are waiting for an answer. The card is left off the page until then.
- **Bulk PDF.** Also only in the wireframe. It needs no new BC work, because it would reuse `document-file`. But BC takes 5–12 seconds per PDF, so it needs a cap (around 20 documents per zip) and a progress count. It's left off until the scope is confirmed.
- **Testing with real documents.** The Dev test customer (C00000033) has no posted documents yet, so the e2e run skips its checks. A test order for it (SOR000000059) couldn't be posted: after the warehouse pick, BC says "There is nothing to post because the document does not contain a quantity or amount". The order was created through `mcrmSalesOrders`, the same way the portal places orders. The BC team is checking whether orders created through the API can be shipped and invoiced. Once that's sorted and C00000033 has an invoice, a delivery receipt and a payment, rerun `e2e/documents.spec.ts`.
- **Credit memos.** Dev has none yet, so the credit memo PDF and its amount sign haven't been seen. The page shows the amount exactly as BC returns it.
