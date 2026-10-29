# Testing runbook (New Order journey)

How to run the tests for the New Order and Submit journey (S3-06, S3-07, S3-10) with Cash and Credit (S3-04, S3-11): the fast unit tests on your machine, and the Playwright tests against the deployed **Dev** site with BC Dev behind it.

| Kind | Runs against | Command | Writes anything? |
|---|---|---|---|
| Unit and component tests (Vitest) | Your machine, BC and Server Logic mocked | `npm test` | No |
| Playwright: prices | Dev site + BC Dev | `npm run e2e -- new-order-quote` | One draft, deleted again by the test |
| Playwright: order journey | Dev site + BC Dev | `npm run e2e -- order-journey` | Nothing, unless `E2E_SUBMIT=1` |
| Playwright: real submits | Dev site + BC Dev | `E2E_SUBMIT=1` + the journey command | **Cash: one real Open Sales Order in BC Dev. Credit: one more BC order, or one held order on Pending Approval plus an approval email to the credit team** |

> **Never point the Playwright tests at UAT or production** (`E2E_BASE_URL`). They save drafts and, with `E2E_SUBMIT=1`, create real BC orders and credit approvals.

---

## 1. Unit and component tests

No sign-in or deploy needed.

```bash
npm test            # everything once
npm run test:watch  # re-runs as you edit
npx vitest run src/modules/orders   # one folder
```

What covers the journey:

| File | Covers |
|---|---|
| `src/modules/orders/new/NewOrderPage.test.tsx` | New Order screen: prices, one UOM per order, Submit confirmation, the "Submitting your order…" spinner, error messages, drafts |
| `src/modules/orders/new/instructions.test.ts` | The instructions' auto line (no duplicates) |
| `src/modules/orders/new/form.test.ts` | Checks before submit (past dates, receiving email) |
| `test/server-logic/orders-submit.test.ts` | The `orders` POST: re-quote, refusals, the body sent to BC; Credit auto-released or held (over available credit, past due) |
| `test/server-logic/orders.test.ts` | The lists, including Pending Approval (`view=pending`) |
| `test/server-logic/order-quote.test.ts` | The `order-quote` endpoint |
| `src/modules/orders/PendingApprovalPage.test.tsx` | Pending Approval tab: statuses, the credit team's comment, paging |
| `test/flows/credit_approval_flow.test.ts` | The credit approval flow's definition (it can't run locally) |

Before you hand off a change, also run `npm run lint` and `npm run build`.

---

## 2. Playwright tests on the Dev site

### Before the first run

- **Google Chrome** is installed. The tests use your installed Chrome, not a bundled browser.
- The new code is **deployed to Dev** (`npm run deploy`). The tests check the deployed site, not your local code.
- You can open the Dev site: your Microsoft work account has access to the private site (Power Pages → Security → Site visibility).
- You have a **portal test user** with **Full Access** or **Orders & Delivery**. Its BC Dev customer has a delivery site, and item `100016` has a price there from plant `SOLID` (see [Settings](#5-settings-environment-variables) to use other data).
- For the credit submit, the customer's BC credit decides which path is tested (see [section 3](#3-the-real-submits-create-bc-dev-records)).

### Step 1: save a login (first time, and whenever it expires)

```bash
npm run e2e:login
```

A Chrome window opens and waits up to 10 minutes. In that window:

1. Sign in with your Microsoft work account if asked (the site is private).
2. Sign in to the portal with your test user.
3. Open **Orders → + New Order**.

When the order lines table shows, the window closes and the login is saved to `e2e/.auth/user.json`.

> `e2e/.auth/user.json` holds your session cookies. It's git-ignored. **Never share or commit it.**

The tests reuse this login and never sign in by themselves. If they start landing on the sign-in page, the login has expired: run step 1 again.

### Step 2: run the tests

```bash
npm run e2e                          # all Playwright tests
npm run e2e -- order-journey         # only the order journey
npm run e2e -- new-order-quote       # only the price tests
npm run e2e -- order-journey -g "Cancel"   # only tests whose name matches "Cancel"
```

### Watching the browser

| Add after `--` | What you get |
|---|---|
| `--headed` | Chrome opens and runs the tests at full speed |
| `--ui` | Playwright's UI mode: pick a test, watch it, then go back through each step with screenshots and network calls. **Best for checking by eye** |
| `--debug` | Pauses before each step so you can step through slowly |

Example: `npm run e2e -- order-journey --ui`

### Step 3: read the report

```bash
npx playwright show-report e2e/report
```

The report has every test's result, the **annotations** (the BC order number to delete, item counts, quote and BC totals) and, for a failed test, a trace you can replay step by step.

---

## 3. The real submits (create BC Dev records)

The two submit tests (cash and credit) are skipped unless you set `E2E_SUBMIT=1`. To run only one of them, add `-g "cash delivery"` or `-g "credit pick-up"`.

**PowerShell**

```powershell
$env:E2E_SUBMIT=1; npm run e2e -- order-journey --headed
Remove-Item Env:E2E_SUBMIT    # afterwards, so later runs don't create orders
```

**Git Bash**

```bash
E2E_SUBMIT=1 npm run e2e -- order-journey --headed
```

**Cash** (`cash delivery order`): creates **one Open Sales Order in BC Dev** with a PO reference like `E2E-1761470000000` and the instruction "E2E test order, please delete". The report's annotation **BC order (delete in BC Dev)** gives its number. **Delete it in BC Dev** after checking it.

**Credit** (`credit pick-up order`, PO reference like `E2E-CR-1761470000000`): BC's live credit figures for the test user's customer decide the path, the same rule the portal uses (S3-04):

| Customer's BC credit | What the test checks | What it leaves behind |
|---|---|---|
| Order total within **Available credit** and **no past-due balance** | "SOR… was auto-approved — within available credit, no past due balance." on Orders, the order found there, View shows Pick up | One Open Sales Order (annotation **BC order (delete in BC Dev)**): delete it in BC Dev |
| Over available credit, or a past-due balance | The warning on New Order, "Your order was sent to our credit team for review." on Pending Approval, the row as *Awaiting credit approval* with its reason | One held order on Pending Approval, and an approval email to the credit team group (annotation **Credit approval (decide in Outlook)**) |

The report's **credit check** annotation records the total, the available credit, whether the past-due warning showed, and the path taken. If the page showed a warning, the test fails unless the order was held.

For a held order, finish the journey by hand: open the approval in Outlook as a credit team member (the email may be in the group's inbox, see Troubleshooting), then
- **Approve:** within seconds the row leaves Pending Approval and the order appears under Orders. Delete that BC order in BC Dev afterwards.
- **Reject** (with a comment): the row shows *Declined* and *"Credit team: <comment>"*. Nothing is created in BC.

On BC Dev (2026-10-29) the test customer C00000002 has a past-due balance, so the credit test takes the **held** path. Testing the auto-approved path needs a customer with a credit limit and no overdue amount; BC Dev has none yet, so ask the BC team to set one up.

---

## 4. What each test checks

### `e2e/order-journey.spec.ts`

| Test | Checks |
|---|---|
| One UOM per order | After line 1 gets `100016`, line 2 offers only items with the same UOM, and an item picked there shows that UOM. With a single empty line, every item is offered again |
| Single auto line | Typing at the end of "Loading type: … Call before delivery: …", then changing the loading type and ticking Call before delivery, leaves one auto line with the typed text below it |
| Confirmation and Cancel | Submit for approval opens "Submit this order?" with BC's order total. Cancel sends nothing to BC, and Submit is available again |
| Credit's terms | Choosing Credit shows Payment terms instead of Prepayment terms; back to Cash shows Prepayment terms and no credit team warning |
| Cash delivery order (opt-in) | Fills a delivery order, confirms, sees the spinner, checks that the browser sent no prices or totals, lands on Orders with "SOR… was submitted.", finds the order by its number (PO reference, Open), and opens View (Delivery, the item, qty 10) |
| Credit pick-up order (opt-in) | Chooses Credit, checks the over-credit warning against Available credit, submits, and follows the path BC's figures take: auto-approved into Orders, or held on Pending Approval with its reason (see section 3) |

### `e2e/new-order-quote.spec.ts`

| Test | Checks |
|---|---|
| Pick up | The line and the summary show BC's quote. No customer number is sent from the browser |
| Two lines | One quote request for both lines, and the totals add up |
| Delivery | Switching to Delivery quotes again with the delivery site, and freight shows up |
| Changing Source | Quotes again with the new plant |
| Typing a quantity | One quote request, after the typing stops |
| Cash over credit | No credit warning for cash orders |
| Qty over 1,000,000 | Refused: dashes and Try again |
| Ten lines | Quoted in one request, in under 10 seconds (soft check) |
| Decimal quantity | Records BC's answer for qty 1.5 |
| Draft total | A saved draft's Est. total matches the Order total. The draft is deleted again |

Amounts are BC Dev's live data, so the tests compare against the quote BC returned in the same test and never against fixed numbers.

---

## 5. Settings (environment variables)

Set these when BC Dev's data changes. Use `$env:NAME="value"` in PowerShell, or `NAME=value` before the command in Git Bash.

| Variable | Default | Use |
|---|---|---|
| `E2E_ITEM` | `100016` | Main item |
| `E2E_ITEM_2` | `100025` | Second item for the two- and ten-line tests. **Must have the same UOM as `E2E_ITEM`** (one UOM per order) |
| `E2E_SOURCE` | `SOLID` | A plant with prices for `E2E_ITEM` at the customer's delivery site (CAVITE has none in BC Dev) |
| `E2E_SUBMIT` | not set | `1` runs the real cash and credit submit tests |
| `E2E_BASE_URL` | `https://chp-portal-dev.powerappsportals.com` | Dev only, never UAT or production |

---

## 6. Troubleshooting

| What you see | Why, and what to do |
|---|---|
| Every test ends on the sign-in page, or times out waiting for "Order lines" | The saved login expired. Run `npm run e2e:login` again |
| You signed in by hand during `--headed`, but the test didn't continue | Test runs never save a login. Use `npm run e2e:login` for that |
| A New Order test fails on something you just changed | Dev still has the old code. Run `npm run deploy`, then try again |
| The two- or ten-line tests can't find `E2E_ITEM_2` in line 2's list | The two items have different UOMs. Set `E2E_ITEM_2` to an item with `E2E_ITEM`'s UOM |
| Submit for approval stays disabled, or the submit test is skipped with "BC can't price…" | BC has no price for the item at that site from that plant. Use `E2E_SOURCE=SOLID`, or ask the BC team to set up prices |
| The credit test always takes the held path | The test customer is over its limit or has a past-due balance in BC Dev (see section 3). That's expected; the auto-approved path needs another customer |
| No approval email after a held credit order | It goes to the credit team group's inbox, not your own, unless the group has "Send copies of group conversations and events to group members" on. Open it as a group member (Outlook → Groups). Also check the credit approval flow's run history |
| A held test order stays on Pending Approval | Nobody has approved or rejected it yet. Decide it in Outlook. Declined rows stay listed for good (by design) |
