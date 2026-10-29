import { expect, test, type Page } from '@playwright/test'
import { addMonths, format, startOfMonth } from 'date-fns'
import type { OrderSubmitDto } from '../src/api/types'
import { peso } from '../src/lib/format'
import { ITEM, PRICED_SOURCE, WARNING, isSubmit, oneLine, openNewOrder, pickSource, quoteAfter, row, uomOf } from './newOrder'

// The order journey on the deployed Dev site (S3-07/S3-10/S3-04): one UOM per order, the instructions' auto line, Credit's terms, the Submit
// confirmation, and (opt-in) real cash and credit submits through to Orders or Pending Approval.

test.beforeEach(async ({ page }) => {
  await openNewOrder(page)
})

const itemOptions = (page: Page, n: number) => page.getByRole('combobox', { name: `Item, line ${n}` })

test("one UOM per order: other lines offer only items in the first line's UOM", async ({ page }) => {
  await itemOptions(page, 1).click()
  const all = await page.getByRole('option').count()
  await page.keyboard.press('Escape')
  await oneLine(page)
  const uom = await uomOf(page, 1)

  await page.getByRole('button', { name: '+ Add line' }).click()
  await itemOptions(page, 2).click()
  const offered = await page.getByRole('option').count()
  test.info().annotations.push({ type: 'UOM', description: `${ITEM} is ${uom}: line 2 offers ${offered} of ${all} items` })
  expect(offered).toBeLessThanOrEqual(all)
  const other = page.getByRole('option').filter({ hasNotText: new RegExp(`^${ITEM} — `) }).first()
  if (offered > 1) {
    await other.click()
    expect(await uomOf(page, 2)).toBe(uom)
  } else {
    await page.keyboard.press('Escape')
  }

  // With the first line gone, the remaining line's UOM is the only limit; with one line, every item is offered again.
  await page.getByRole('button', { name: 'Remove line 1' }).click()
  await page.getByRole('button', { name: 'Remove line 1' }).click()
  await page.getByRole('button', { name: '+ Add line' }).click()
  await itemOptions(page, 1).click()
  await expect(page.getByRole('option')).toHaveCount(all)
  await page.keyboard.press('Escape')
})

test('typing on the auto line, then changing loading type, keeps a single auto line', async ({ page }) => {
  const instructions = page.getByLabel('Special delivery instructions')
  await instructions.click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('End')
  await page.keyboard.type(' Test Test')
  await page.getByRole('combobox', { name: 'Loading type' }).click()
  await page.getByRole('option', { name: 'Palletized' }).click()
  await page.getByLabel('Call before delivery').check()
  await expect(instructions).toHaveValue('Loading type: Palletized. Call before delivery: Yes.\nTest Test')
})

test('Submit asks first with the order total; Cancel sends nothing to BC', async ({ page }) => {
  let submits = 0
  page.on('request', (request) => {
    if (request.url().includes('/_api/serverlogics/orders') && request.method() === 'POST') submits++
  })
  await pickSource(page, PRICED_SOURCE)
  const { quote } = await oneLine(page)
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  const dialog = page.getByRole('dialog', { name: 'Submit this order?' })
  await expect(dialog).toContainText(peso(quote!.total))
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await page.waitForTimeout(1500)
  expect(submits).toBe(0)
  await expect(page.getByRole('button', { name: 'Submit for approval' })).toBeEnabled()
})

test('Credit shows Payment terms instead of Prepayment terms, and Cash brings them back', async ({ page }) => {
  await choosePayment(page, 'Credit')
  await expect(page.getByLabel('Payment terms', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Prepayment terms')).toBeHidden()
  await choosePayment(page, 'Cash')
  await expect(page.getByLabel('Prepayment terms')).toBeVisible()
  await expect(page.getByText(CREDIT_TEAM)).toBeHidden()
})

async function choosePayment(page: Page, method: 'Cash' | 'Credit') {
  await page.getByRole('combobox', { name: 'Payment method' }).click()
  await page.getByRole('option', { name: method, exact: true }).click()
}

// Both credit warnings end with this; neither shows for Cash.
const CREDIT_TEAM = /submit (this order|it) for review by our credit team/

/** Submit for approval → the confirmation with BC's total → Submit order. Returns what the browser sent and the server's answer. */
async function confirmAndSubmit(page: Page, total: number) {
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  const dialog = page.getByRole('dialog', { name: 'Submit this order?' })
  await expect(dialog).toContainText(peso(total))
  const submitted = page.waitForResponse(isSubmit, { timeout: 60_000 })
  await dialog.getByRole('button', { name: 'Submit order' }).click()
  // The spinner shows while BC re-quotes and creates the order (seconds: two BC calls).
  await expect(page.getByText('Submitting your order…')).toBeVisible()
  const response = await submitted
  expect(response.ok()).toBe(true)
  const envelope = (await response.json()) as { data?: unknown; Data?: unknown }
  const raw = envelope.data ?? envelope.Data
  const answer = (typeof raw === 'string' ? JSON.parse(raw) : raw) as OrderSubmitDto
  return { body: response.request().postDataJSON() as Record<string, unknown>, answer }
}

/** Orders: the order found by its number, with its PO reference; returns its row. */
async function findInOrders(page: Page, so: string, poRef: string) {
  await page.getByLabel('Search orders').fill(so)
  const order = page.getByRole('table', { name: 'Orders' }).getByRole('row').filter({ hasText: so })
  await expect(order).toBeVisible({ timeout: 30_000 })
  await expect(order).toContainText(poRef)
  await expect.soft(order, 'a new order is Open').toContainText('Open')
  return order
}

// Creates a real Open Sales Order in BC Dev, so it runs only with E2E_SUBMIT=1. Delete the order in BC afterwards
// (its number is in the report's annotations).
test('cash delivery order: confirm, submit, then find it in Orders with its details', async ({ page }) => {
  test.skip(process.env.E2E_SUBMIT !== '1', 'creates a BC Dev order: set E2E_SUBMIT=1 to run')
  const poRef = `E2E-${Date.now()}`

  await pickSource(page, PRICED_SOURCE)
  await oneLine(page, ITEM, '10')
  const site = (await page.getByRole('combobox', { name: 'Delivery site' }).textContent())!.split(' — ')[0].trim()
  expect(site, 'the customer needs a delivery site').not.toBe('')
  const { quote } = await quoteAfter(page, () => page.getByRole('radio', { name: 'Delivery' }).click(), (sent) => sent.shipmentMethod === 'delivery')
  test.skip(!quote || quote.lines.some((line) => line.unitPrice <= 0), `BC can't price ${ITEM} for delivery to ${site} from ${PRICED_SOURCE}`)
  await page.getByLabel('Receiving person').fill('E2E Receiver')
  await page.getByLabel('Receiving contact number').fill('0917 123 4567')
  await page.getByLabel('Receiving email').fill('e2e.receiving@example.com')
  await page.getByRole('combobox', { name: 'Receiving time window' }).click()
  await page.getByRole('option', { name: 'Anytime' }).click()
  await page.getByLabel('Special delivery instructions').press('End')
  await page.getByLabel('Special delivery instructions').pressSequentially('\nE2E test order, please delete')
  await page.getByLabel('Your PO reference (optional)').fill(poRef)

  const { body, answer } = await confirmAndSubmit(page, quote!.total)

  // What the browser sent: the order's choices, never a price or total.
  expect(Object.keys(body).sort()).toEqual(
    ['instructions', 'lines', 'paymentMethod', 'pickupDate', 'poRef', 'receivingContact', 'receivingEmail', 'receivingPerson', 'requestedDate', 'shipmentMethod', 'site', 'source', 'timeWindow'].sort(),
  )
  expect(body).toMatchObject({
    shipmentMethod: 'delivery',
    source: PRICED_SOURCE,
    site,
    paymentMethod: 'cash',
    poRef,
    receivingPerson: 'E2E Receiver',
    receivingContact: '0917 123 4567',
    receivingEmail: 'e2e.receiving@example.com',
    timeWindow: '24H',
    instructions: 'Loading type: Loose pile. Call before delivery: No.\nE2E test order, please delete',
    lines: [{ code: ITEM, qty: 10 }],
  })
  expect(Object.keys((body.lines as object[])[0]).sort()).toEqual(['code', 'qty', 'uom'])
  expect(answer, 'BC priced every line again').toHaveProperty('so')
  expect(answer, 'cash never goes to the credit team').not.toHaveProperty('autoApproved')
  const so = (answer as { so: string }).so
  test.info().annotations.push({ type: 'BC order (delete in BC Dev)', description: `${so} · PO ${poRef}` })

  // Orders: the note, then the order itself, found by its number.
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.getByRole('status').filter({ hasText: `${so} was submitted.` })).toBeVisible()
  const order = await findInOrders(page, so, poRef)
  test.info().annotations.push({ type: 'totals', description: `quote ${peso(quote!.total)} · BC order ${(await order.getByRole('cell').nth(8).textContent())?.trim()}` })

  // Its details, from BC.
  await order.getByRole('button', { name: 'View' }).click()
  const details = page.getByRole('dialog', { name: so })
  await expect(details).toContainText(poRef)
  await expect(details.getByText('Shipment method', { exact: true }).locator('..')).toContainText('Delivery')
  const line = details.getByRole('table', { name: 'Order lines' }).getByRole('row').filter({ hasText: new RegExp(`^${ITEM} — `) })
  await expect(line).toBeVisible()
  await expect(line.getByRole('cell').nth(1)).toHaveText('10')
})

// A real credit submit, so it runs only with E2E_SUBMIT=1. BC's live figures decide the path (S3-04):
// within available credit and no past due → a BC order at once (delete it in BC Dev afterwards);
// otherwise → held on Pending Approval and the credit team gets an approval in Outlook (approve or reject it there).
test('credit pick-up order: auto-approved into Orders, or held on Pending Approval for the credit team', async ({ page }) => {
  test.skip(process.env.E2E_SUBMIT !== '1', 'creates a BC Dev order or a credit approval: set E2E_SUBMIT=1 to run')
  const poRef = `E2E-CR-${Date.now()}`

  await pickSource(page, PRICED_SOURCE)
  const { quote } = await oneLine(page, ITEM, '10')
  test.skip(!quote || quote.lines.some((line) => line.unitPrice <= 0), `BC can't price ${ITEM} for pick up from ${PRICED_SOURCE}`)
  await choosePayment(page, 'Credit')
  await expect(row(page, 'Available credit')).toContainText('₱')
  const available = Number((await row(page, 'Available credit').textContent())!.replace(/[^0-9.-]/g, ''))
  const overCredit = quote!.total > available
  const pastDue = await page.getByText('⚠ Your account has a past due balance.', { exact: false }).isVisible()
  await expect(page.getByText(WARNING)).toBeVisible({ visible: overCredit })
  await page.getByLabel('Your PO reference (optional)').fill(poRef)
  // The 15th of next month: always in the future, and one "next month" click away.
  const pickup = addMonths(startOfMonth(new Date()), 1)
  pickup.setDate(15)
  await page.getByLabel('Pick up date').click()
  await page.getByRole('button', { name: 'Go to the Next Month' }).click()
  await page.getByRole('button', { name: new RegExp(format(pickup, 'MMMM do, yyyy')) }).click()
  await expect(page.getByLabel('Pick up date')).toHaveText(format(pickup, 'MMM d, yyyy'))

  const { body, answer } = await confirmAndSubmit(page, quote!.total)
  expect(body).toMatchObject({
    paymentMethod: 'credit',
    shipmentMethod: 'pickup',
    source: PRICED_SOURCE,
    pickupDate: format(pickup, 'yyyy-MM-dd'),
    poRef,
    lines: [{ code: ITEM, qty: 10 }],
  })
  const held = 'pending' in answer
  test.info().annotations.push({
    type: 'credit check',
    description: `total ${peso(quote!.total)} · available ${peso(available)} · past due warning ${pastDue ? 'yes' : 'no'} → ${held ? 'held' : 'auto-approved'}`,
  })
  if (overCredit || pastDue) expect(answer, 'over credit or past due goes to the credit team').toEqual({ pending: true })

  if (held) {
    test.info().annotations.push({ type: 'Credit approval (decide in Outlook)', description: `PO ${poRef}: the email shows Pick-up date ${format(pickup, 'yyyy-MM-dd')}. Approve creates a BC order (delete it in BC Dev); Reject creates nothing` })
    await expect(page).toHaveURL(/\/orders\/pending$/)
    await expect(page.getByRole('status').filter({ hasText: 'Your order was sent to our credit team for review.' })).toBeVisible()
    const pending = page.getByRole('table', { name: 'Pending Approval' }).getByRole('row').filter({ hasText: poRef })
    await expect(pending).toContainText('Awaiting credit approval')
    if (pastDue) await expect(pending).toContainText('Account has a past due balance')
    if (overCredit) await expect(pending).toContainText('Order exceeds available credit')
    return
  }

  expect(answer).toMatchObject({ autoApproved: true })
  const so = (answer as { so: string }).so
  test.info().annotations.push({ type: 'BC order (delete in BC Dev)', description: `${so} · PO ${poRef}` })
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.getByRole('status').filter({ hasText: `${so} was auto-approved — within available credit, no past due balance.` })).toBeVisible()
  const order = await findInOrders(page, so, poRef)
  await order.getByRole('button', { name: 'View' }).click()
  const details = page.getByRole('dialog', { name: so })
  await expect(details.getByText('Shipment method', { exact: true }).locator('..')).toContainText('Pick up')
})

// A real Blanket Order in BC Dev (S3-16), so it runs only with E2E_SUBMIT=1: the customer's typed price goes to BC as is,
// and a Blanket Order never goes to the credit team. Delete the BSO in BC Dev afterwards.
test('blanket pick-up order: typed price, submit, then find the BSO on Blanket Orders', async ({ page }) => {
  test.skip(process.env.E2E_SUBMIT !== '1', 'creates a BC Dev Blanket Order: set E2E_SUBMIT=1 to run')
  const poRef = `E2E-BL-${Date.now()}`

  await page.getByRole('radio', { name: 'Blanket Order' }).click()
  await pickSource(page, PRICED_SOURCE)
  const { quote } = await oneLine(page, ITEM, '10')
  await page.getByRole('spinbutton', { name: 'Unit price, line 1' }).fill('150')
  await expect(row(page, 'Subtotal')).toContainText(peso(1500))
  await page.getByLabel('Your PO reference (optional)').fill(poRef)

  const { body, answer } = await confirmAndSubmit(page, 1500 + quote!.freight + quote!.otherCharges)
  expect(body).toMatchObject({ orderType: 'blanket', shipmentMethod: 'pickup', source: PRICED_SOURCE, poRef, lines: [{ code: ITEM, qty: 10, price: 150 }] })
  expect(answer, 'a Blanket Order is created, never held').toHaveProperty('so')
  const bso = (answer as { so: string }).so
  test.info().annotations.push({ type: 'BC Blanket Order (delete in BC Dev)', description: `${bso} · PO ${poRef}` })

  await expect(page).toHaveURL(/\/orders\/blanket$/)
  await expect(page.getByRole('status').filter({ hasText: `${bso} was submitted.` })).toBeVisible()
  const order = page.getByRole('table', { name: 'Blanket Orders' }).getByRole('row').filter({ hasText: bso })
  await expect(order).toBeVisible({ timeout: 30_000 })
  await expect(order).toContainText(poRef)
  test.info().annotations.push({ type: 'totals', description: `typed ${peso(1500)} + charges · BC ${(await order.getByRole('cell').nth(4).textContent())?.trim()}` })
})
