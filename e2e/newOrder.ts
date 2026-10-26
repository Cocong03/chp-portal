import { expect, type Page, type Response } from '@playwright/test'
import type { OrderQuoteDto, OrderQuoteRequest } from '../src/api/types'
import { peso } from '../src/lib/format'

// Shared by the New Order specs. Items and plant are BC Dev's; override them with env vars when BC Dev's data changes.
export const ITEM = process.env.E2E_ITEM ?? '100016'
// Must share ITEM's unit of measure: an order takes one UOM (2026-10-26).
export const ITEM_2 = process.env.E2E_ITEM_2 ?? '100025'
// A plant with Custom Sales Prices for ITEM at the customer's delivery site (BC Dev 2026-10-25: CAVITE has none).
export const PRICED_SOURCE = process.env.E2E_SOURCE ?? 'SOLID'
export const WARNING = '⚠ This order exceeds your available credit. You may still submit it for review by our credit team.'

const isQuote = (response: Response) => response.url().includes('/_api/serverlogics/order-quote') && response.request().method() === 'POST'
export const isSubmit = (response: Response) => response.url().includes('/_api/serverlogics/orders') && response.request().method() === 'POST'

type Sent = OrderQuoteRequest & Record<string, unknown>

/** Runs `action` and returns the order-quote it triggers (the first one whose request passes `match`): what was sent and BC's answer. */
export async function quoteAfter(page: Page, action: () => Promise<unknown>, match: (sent: Sent) => boolean = () => true) {
  const wanted = (response: Response) => isQuote(response) && match(response.request().postDataJSON() as Sent)
  const [response] = await Promise.all([page.waitForResponse(wanted), action()])
  const request = response.request().postDataJSON() as Sent
  const envelope = (await response.json().catch(() => ({}))) as { data?: unknown; Data?: unknown }
  const raw = envelope.data ?? envelope.Data
  const quote = (typeof raw === 'string' ? JSON.parse(raw) : raw) as OrderQuoteDto | undefined
  return { response, request, quote }
}

export const row = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('..')
export const lineRow = (page: Page, n: number) => page.getByRole('table', { name: 'Order lines' }).getByRole('row').nth(n)
export const qty = (page: Page, n: number) => page.getByRole('spinbutton', { name: `Quantity, line ${n}` })
export const uomOf = async (page: Page, n: number) => (await lineRow(page, n).getByRole('cell').nth(2).textContent())!.trim()

export async function pickItem(page: Page, n: number, code: string) {
  await page.getByRole('combobox', { name: `Item, line ${n}` }).click()
  await page.getByRole('option', { name: new RegExp(`^${code} — `) }).click()
}

export async function pickSource(page: Page, code: string) {
  await page.getByRole('combobox', { name: 'Source' }).click()
  await page.getByRole('option', { name: new RegExp(`^${code} — `) }).click()
}

/** Line n = `code` × `amount`, waiting for its quote. Qty first: a line without an item is never quoted. */
export async function setLine(page: Page, n: number, code: string, amount: string) {
  await qty(page, n).fill(amount)
  return quoteAfter(page, () => pickItem(page, n, code), (sent) => sent.lines.length === n && sent.lines[n - 1].code === code)
}
export const oneLine = (page: Page, code = ITEM, amount = '10') => setLine(page, 1, code, amount)

export async function expectSummary(page: Page, quote: OrderQuoteDto) {
  await expect(row(page, 'Subtotal')).toContainText(peso(quote.subtotal))
  await expect(row(page, 'Transport / Freight')).toContainText(peso(quote.freight))
  await expect(row(page, 'Other charges')).toContainText(peso(quote.otherCharges))
  await expect(row(page, 'Order total')).toContainText(peso(quote.total))
}

export async function openNewOrder(page: Page) {
  await page.goto('/orders/new')
  await expect(page.getByRole('table', { name: 'Order lines' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Pick up' })).toHaveAttribute('aria-checked', 'true')
}
