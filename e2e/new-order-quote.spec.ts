import { expect, test, type Page, type Response } from '@playwright/test'
import type { OrderQuoteDto, OrderQuoteRequest } from '../src/api/types'
import { peso } from '../src/lib/format'

// S3-06 New Order prices from BC's quote (and S3-10 Submit, opt-in), on the deployed Dev site. Prices are BC Dev's live data, so every amount is
// checked against the quote BC answered in the same test, never a fixed number.
const ITEM = process.env.E2E_ITEM ?? '100016'
const ITEM_2 = process.env.E2E_ITEM_2 ?? '100025'
// A plant with Custom Sales Prices for ITEM at the customer's delivery site (BC Dev 2026-10-25: CAVITE has none).
const PRICED_SOURCE = process.env.E2E_SOURCE ?? 'SOLID'
const WARNING = '⚠ This order exceeds your available credit. You may still submit it for review by our credit team.'

const isQuote = (response: Response) => response.url().includes('/_api/serverlogics/order-quote') && response.request().method() === 'POST'

type Sent = OrderQuoteRequest & Record<string, unknown>

/** Runs `action` and returns the order-quote it triggers (the first one whose request passes `match`): what was sent and BC's answer. */
async function quoteAfter(page: Page, action: () => Promise<unknown>, match: (sent: Sent) => boolean = () => true) {
  const wanted = (response: Response) => isQuote(response) && match(response.request().postDataJSON() as Sent)
  const [response] = await Promise.all([page.waitForResponse(wanted), action()])
  const request = response.request().postDataJSON() as Sent
  const envelope = (await response.json().catch(() => ({}))) as { data?: unknown; Data?: unknown }
  const raw = envelope.data ?? envelope.Data
  const quote = (typeof raw === 'string' ? JSON.parse(raw) : raw) as OrderQuoteDto | undefined
  return { response, request, quote }
}

const row = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..')
const lineRow = (page: Page, n: number) => page.getByRole('table', { name: 'Order lines' }).getByRole('row').nth(n)
const qty = (page: Page, n: number) => page.getByRole('spinbutton', { name: `Quantity, line ${n}` })

async function pickItem(page: Page, n: number, code: string) {
  await page.getByRole('combobox', { name: `Item, line ${n}` }).click()
  await page.getByRole('option', { name: new RegExp(`^${code} — `) }).click()
}

async function pickSource(page: Page, code: string) {
  await page.getByRole('combobox', { name: 'Source' }).click()
  await page.getByRole('option', { name: new RegExp(`^${code} — `) }).click()
}

/** Line n = `code` × `amount`, waiting for its quote. Qty first: a line without an item is never quoted. */
async function setLine(page: Page, n: number, code: string, amount: string) {
  await qty(page, n).fill(amount)
  return quoteAfter(page, () => pickItem(page, n, code), (sent) => sent.lines.length === n && sent.lines[n - 1].code === code)
}
const oneLine = (page: Page, code = ITEM, amount = '10') => setLine(page, 1, code, amount)

async function expectSummary(page: Page, quote: OrderQuoteDto) {
  await expect(row(page, 'Subtotal')).toContainText(peso(quote.subtotal))
  await expect(row(page, 'Transport / Freight')).toContainText(peso(quote.freight))
  await expect(row(page, 'Other charges')).toContainText(peso(quote.otherCharges))
  await expect(row(page, 'Order total')).toContainText(peso(quote.total))
}

test.beforeEach(async ({ page }) => {
  await page.goto('/orders/new')
  await expect(page.getByRole('table', { name: 'Order lines' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Pick up' })).toHaveAttribute('aria-checked', 'true')
})

test("pick up: the line and summary show BC's quote", async ({ page }) => {
  const { request, quote } = await oneLine(page)
  const uom = (await lineRow(page, 1).getByRole('cell').nth(2).textContent())!.trim()
  expect(request).toEqual({ shipmentMethod: 'pickup', source: expect.any(String), site: '', lines: [{ code: ITEM, uom, qty: 10 }] })
  expect(request).not.toHaveProperty('customerNo')
  const line = quote!.lines[0]
  await expect(lineRow(page, 1)).toContainText(peso(line.unitPrice))
  await expect(lineRow(page, 1)).toContainText(peso(line.lineAmount))
  await expect(row(page, 'Lines')).toContainText('1')
  await expectSummary(page, quote!)
  test.info().annotations.push({ type: 'BC pick up', description: JSON.stringify(line) })
})

test('two lines: one request, and the totals add up the lines', async ({ page }) => {
  await oneLine(page)
  await page.getByRole('button', { name: '+ Add line' }).click()
  const { request, quote } = await setLine(page, 2, ITEM_2, '5')
  expect(request.lines.map((line) => line.code)).toEqual([ITEM, ITEM_2])
  expect(quote!.lines).toHaveLength(2)
  const sum = (key: 'lineAmount' | 'total') => Math.round(quote!.lines.reduce((total, line) => total + line[key], 0) * 100) / 100
  expect(quote!.subtotal).toBe(sum('lineAmount'))
  expect(quote!.total).toBe(sum('total'))
  await expect(row(page, 'Lines')).toContainText('2')
  await expectSummary(page, quote!)
})

test('Delivery re-quotes with the delivery site; freight and other charges follow', async ({ page }) => {
  await pickSource(page, PRICED_SOURCE)
  await oneLine(page, ITEM, '50')
  const site = (await page.getByRole('combobox', { name: 'Delivery site' }).textContent())!.split(' — ')[0].trim()
  expect(site, 'the customer needs a delivery site').not.toBe('')
  const { request, quote } = await quoteAfter(page, () => page.getByRole('radio', { name: 'Delivery' }).click(), (sent) => sent.shipmentMethod === 'delivery')
  expect(request).toMatchObject({ shipmentMethod: 'delivery', site })
  await expectSummary(page, quote!)
  // BC Dev 2026-10-23: delivery to 65072350 charged ₱10 freight and ₱5 fuel per bag. Soft: depends on BC's rates.
  expect.soft(quote!.freight, 'freight for delivery').toBeGreaterThan(0)
  test.info().annotations.push({ type: 'BC delivery', description: JSON.stringify(quote!.lines[0]) })
})

test('changing Source re-quotes with that plant', async ({ page }) => {
  await oneLine(page)
  const source = page.getByRole('combobox', { name: 'Source' })
  const current = (await source.textContent())!.split(' — ')[0].trim()
  await source.click()
  const other = page.getByRole('option').filter({ hasNotText: new RegExp(`^${current} — `) }).first()
  const code = (await other.textContent())!.split(' — ')[0].trim()
  const { request, quote } = await quoteAfter(page, () => other.click(), (sent) => sent.source === code)
  expect(request.source).toBe(code)
  await expectSummary(page, quote!)
})

test('typing a quantity quickly sends one quote, after the typing stops', async ({ page }) => {
  await oneLine(page)
  let sent = 0
  page.on('request', (request) => {
    if (request.url().includes('/_api/serverlogics/order-quote') && request.method() === 'POST') sent++
  })
  await qty(page, 1).clear()
  const { request } = await quoteAfter(page, () => qty(page, 1).pressSequentially('1250', { delay: 80 }), (sent) => sent.lines[0].qty === 1250)
  await page.waitForTimeout(1500)
  expect(request.lines[0].qty).toBe(1250)
  expect(sent).toBe(1)
})

// Cash orders need no credit approval (2026-10-26); the warning returns with Credit in Phase 2.
test('a cash order over the available credit shows no warning', async ({ page }) => {
  await expect(row(page, 'Available credit')).toContainText('₱')
  const available = Number((await row(page, 'Available credit').textContent())!.replace(/[^0-9.-]/g, ''))
  const { quote } = await oneLine(page, ITEM, '1000000')
  test.skip(!(quote!.total > available), `BC priced ${ITEM} × 1,000,000 at ${quote!.total}, within the available credit`)
  await expect(row(page, 'Order total')).toContainText(peso(quote!.total))
  await expect(page.getByText(WARNING)).toBeHidden()
})

test('a quantity over 1,000,000 is refused: dashes, Try again, no warning', async ({ page }) => {
  const { response } = await oneLine(page, ITEM, '1000001')
  expect(response.ok()).toBe(false)
  await expect(page.getByRole('alert')).toContainText("We couldn't load this information. Please try again.")
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(row(page, 'Order total')).toContainText('—')
  await expect(page.getByText(WARNING)).toBeHidden()
})

test('ten lines are quoted in one request', async ({ page }) => {
  await oneLine(page)
  for (let n = 2; n <= 9; n++) {
    await page.getByRole('button', { name: '+ Add line' }).click()
    await qty(page, n).fill('2')
    await pickItem(page, n, n % 2 ? ITEM : ITEM_2)
  }
  await page.getByRole('button', { name: '+ Add line' }).click()
  await qty(page, 10).fill('3')
  const started = Date.now()
  const { request, quote } = await quoteAfter(page, () => pickItem(page, 10, ITEM_2), (sent) => sent.lines.length === 10)
  const seconds = (Date.now() - started) / 1000
  expect(request.lines).toHaveLength(10)
  expect(quote!.lines).toHaveLength(10)
  await expectSummary(page, quote!)
  test.info().annotations.push({ type: 'ten-line quote', description: `${seconds.toFixed(1)} s including the 0.4 s wait` })
  expect.soft(seconds, 'ten-line quote time').toBeLessThan(10)
})

test("a decimal quantity: records BC's answer", async ({ page }) => {
  const { response, quote } = await oneLine(page, ITEM, '1.5')
  test.info().annotations.push({ type: 'qty 1.5', description: `${response.status()} ${JSON.stringify(quote?.lines[0] ?? null)}` })
})

// Writes one draft to Dataverse Dev and deletes it again.
test("a saved draft's Est. total matches the Order total", async ({ page }) => {
  const { quote } = await oneLine(page)
  await page.getByRole('button', { name: 'Save as draft' }).click()
  const toast = page.getByText(/^Draft #\d+ saved$/)
  await expect(toast).toBeVisible()
  const label = (await toast.textContent())!.replace(' saved', '')
  try {
    await page.goto('/orders/drafts')
    const draft = page.getByRole('table', { name: 'Drafts' }).getByRole('row').filter({ hasText: label })
    await expect(draft).toContainText(peso(quote!.total))
  } finally {
    await page.goto('/orders/drafts')
    const draft = page.getByRole('table', { name: 'Drafts' }).getByRole('row').filter({ hasText: label })
    await draft.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete draft' }).click()
    await expect(draft).toHaveCount(0)
  }
})

// S3-10 Submit. Creates a real Open Sales Order in BC Dev, so it runs only with E2E_SUBMIT=1; delete the order in BC after.
test('Submit creates the BC sales order and opens Orders with its number', async ({ page }) => {
  test.skip(process.env.E2E_SUBMIT !== '1', 'creates a BC Dev order: set E2E_SUBMIT=1 to run')
  await pickSource(page, PRICED_SOURCE)
  await oneLine(page, ITEM, '10')
  await page.getByLabel('Your PO reference (optional)').fill(`E2E-${Date.now()}`)
  const [response] = await Promise.all([
    page.waitForResponse((each) => each.url().includes('/_api/serverlogics/orders') && each.request().method() === 'POST'),
    page.getByRole('button', { name: 'Submit for approval' }).click(),
  ])
  expect(response.request().postDataJSON()).toMatchObject({ paymentMethod: 'cash', source: PRICED_SOURCE, lines: [{ code: ITEM, qty: 10 }] })
  const note = page.getByText(/^SOR\d+ was submitted\.$/)
  await expect(note).toBeVisible({ timeout: 30_000 })
  test.info().annotations.push({ type: 'BC order', description: (await note.textContent())! })
})
