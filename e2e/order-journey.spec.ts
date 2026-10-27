import { expect, test, type Page } from '@playwright/test'
import type { OrderSubmitDto } from '../src/api/types'
import { peso } from '../src/lib/format'
import { ITEM, PRICED_SOURCE, isSubmit, oneLine, openNewOrder, pickSource, quoteAfter, uomOf } from './newOrder'

// The order journey on the deployed Dev site (S3-07/S3-10): one UOM per order, the instructions' auto line, the Submit
// confirmation, and (opt-in) a real submit through to Orders and the order's details.

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

// Creates a real Open Sales Order in BC Dev, so it runs only with E2E_SUBMIT=1. Delete the order in BC afterwards
// (its number is in the report's annotations).
test('delivery order: confirm, submit, then find it in Orders with its details', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Submit for approval' }).click()
  const dialog = page.getByRole('dialog', { name: 'Submit this order?' })
  await expect(dialog).toContainText(peso(quote!.total))
  const submitted = page.waitForResponse(isSubmit, { timeout: 60_000 })
  await dialog.getByRole('button', { name: 'Submit order' }).click()
  // The spinner shows while BC re-quotes and creates the order (seconds: two BC calls).
  await expect(page.getByText('Submitting your order…')).toBeVisible()
  const response = await submitted

  // What the browser sent: the order's choices, never a price or total.
  const body = response.request().postDataJSON() as Record<string, unknown>
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
  expect(response.ok()).toBe(true)
  const envelope = (await response.json()) as { data?: unknown; Data?: unknown }
  const raw = envelope.data ?? envelope.Data
  const answer = (typeof raw === 'string' ? JSON.parse(raw) : raw) as OrderSubmitDto
  expect(answer, 'BC priced every line again').toHaveProperty('so')
  const so = (answer as { so: string }).so
  test.info().annotations.push({ type: 'BC order (delete in BC Dev)', description: `${so} · PO ${poRef}` })

  // Orders: the note, then the order itself, found by its number.
  await expect(page).toHaveURL(/\/orders$/)
  await expect(page.getByRole('status').filter({ hasText: `${so} was submitted.` })).toBeVisible()
  await page.getByLabel('Search orders').fill(so)
  const order = page.getByRole('table', { name: 'Orders' }).getByRole('row').filter({ hasText: so })
  await expect(order).toBeVisible({ timeout: 30_000 })
  await expect(order).toContainText(poRef)
  await expect.soft(order, 'a new order is Open').toContainText('Open')
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
