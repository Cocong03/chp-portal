import { expect, test } from '@playwright/test'
import { peso } from '../src/lib/format'
import { ITEM, ITEM_2, PRICED_SOURCE, WARNING, expectSummary, lineRow, oneLine, openNewOrder, pickItem, pickSource, qty, quoteAfter, row, setLine } from './newOrder'

// S3-06 New Order prices from BC's quote, on the deployed Dev site. Prices are BC Dev's live data, so every amount is
// checked against the quote BC answered in the same test, never a fixed number. Submit is in order-journey.spec.ts.

test.beforeEach(async ({ page }) => {
  await openNewOrder(page)
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
