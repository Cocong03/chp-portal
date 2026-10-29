import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// S2-16 / S2-17: Document Center on the deployed Dev site. Read-only: nothing is created.
const EMPTY = 'No documents match your filters.'
const rows = (page: Page) => page.getByRole('table', { name: 'Documents' }).getByRole('row')

test.beforeEach(async ({ page }) => {
  await page.goto('/documents')
  await expect(page.getByRole('heading', { name: 'Document Center' }).first()).toBeVisible({ timeout: 60_000 })
  // Wait for the list to settle: a data row or the empty text.
  await expect(page.getByRole('button', { name: 'Download' }).first().or(page.getByText(EMPTY))).toBeVisible({ timeout: 60_000 })
  test.skip(await page.getByText(EMPTY).isVisible(), 'The test customer has no posted documents on Dev (no posted documents)')
})

test('the list loads with the expected columns', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Documents' })
  for (const name of ['Document type', 'Reference no.', 'Sales order no.', 'Date', 'Amount']) {
    await expect(table.getByRole('columnheader', { name })).toBeVisible()
  }
})

test('the Invoice type filter leaves only invoices', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Filter by document type' }).click()
  await page.getByRole('option', { name: 'Invoice' }).click()
  await expect(page.getByRole('button', { name: 'Download' }).first().or(page.getByText(EMPTY))).toBeVisible({ timeout: 60_000 })
  test.skip(await page.getByText(EMPTY).isVisible(), 'No invoices for the test customer')
  const count = (await rows(page).count()) - 1
  for (let i = 1; i <= count; i++) await expect(rows(page).nth(i).getByRole('cell').first()).toHaveText('Invoice')
})

test('searching by the first row SO no. narrows the list to that SO', async ({ page }) => {
  const so = (await rows(page).nth(1).getByRole('cell').nth(2).innerText()).trim()
  test.skip(so === '—' || so === '', 'The first document has no sales order no.')
  await page.getByRole('searchbox', { name: 'Search documents' }).fill(so)
  await expect(page).toHaveURL(/q=/)
  await expect(async () => {
    const n = (await rows(page).count()) - 1
    expect(n).toBeGreaterThan(0)
    for (let i = 1; i <= n; i++) await expect(rows(page).nth(i).getByRole('cell').nth(2)).toHaveText(so, { timeout: 1000 })
  }).toPass({ timeout: 30_000 })
})

test('Download saves a PDF', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await rows(page).nth(1).getByRole('button', { name: 'Download' }).click()
  const path = await (await downloadPromise).path()
  expect(readFileSync(path).subarray(0, 5).toString('latin1')).toBe('%PDF-')
})

test('CSV / Excel saves Documents-<date>.xlsx', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'CSV / Excel' }).click()
  expect((await downloadPromise).suggestedFilename()).toMatch(/^Documents-\d{4}-\d{2}-\d{2}\.xlsx$/)
})

test('the first invoice with an SO no. is found on Orders and its invoice no. on the Ledger', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Filter by document type' }).click()
  await page.getByRole('option', { name: 'Invoice' }).click()
  await expect(page.getByRole('button', { name: 'Download' }).first().or(page.getByText(EMPTY))).toBeVisible({ timeout: 60_000 })
  test.skip(await page.getByText(EMPTY).isVisible(), 'No invoices for the test customer')
  const n = (await rows(page).count()) - 1
  let ref = ''
  let so = ''
  for (let i = 1; i <= n && !so; i++) {
    const cells = rows(page).nth(i).getByRole('cell')
    const candidate = (await cells.nth(2).innerText()).trim()
    if (candidate && candidate !== '—') {
      so = candidate
      ref = (await cells.nth(1).innerText()).trim()
    }
  }
  test.skip(!so, 'No invoice with a sales order no. on the first page')

  await page.goto(`/orders?q=${encodeURIComponent(so)}`)
  await expect(page.getByRole('table').getByText(so).first()).toBeVisible({ timeout: 60_000 })

  await page.goto(`/ledger?show=all&q=${encodeURIComponent(ref)}`)
  await expect(page.getByRole('table').getByText(ref).first()).toBeVisible({ timeout: 60_000 })
})
