import { expect, test } from '@playwright/test'

// S4-04 / S4-05 / S4-07: submit a request and a complaint on the deployed Dev site.
// WARNING: each test writes a real Dataverse row and, through the send flows, a real monday item on the Dev boards.
// Nothing is cleaned up; find the leftovers by their "E2E <timestamp>" text.
const STAMP = `E2E ${new Date().toISOString()}`
// 1x1 transparent PNG
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64')

test('a request submitted in the portal is listed as Submitted with an RQ- reference', async ({ page }) => {
  await page.goto('/requests')
  await page.getByRole('button', { name: 'New request' }).click()
  const dialog = page.getByRole('dialog', { name: 'New request' })

  await dialog.getByLabel('Category', { exact: true }).click()
  await page.getByRole('option', { name: 'Document Copy' }).click()
  await dialog.getByLabel('Request type').click()
  await page.getByRole('option', { name: 'Delivery Receipt (DR)' }).click()
  await dialog.getByLabel('Document reference').fill('DR-E2E-01')
  await dialog.getByLabel('Date of document').click()
  await page.getByRole('gridcell').getByRole('button').first().click()
  await dialog.getByLabel('Request details').fill(`${STAMP} request`)
  await dialog.getByRole('button', { name: 'Submit request' }).click()

  await expect(page.getByText(/Request RQ-\d+ submitted\./)).toBeVisible()
  const top = page.getByRole('table').getByRole('row').nth(1)
  await expect(top).toContainText(`${STAMP} request`)
  await expect(top).toContainText(/RQ-\d+/)
  await expect(top).toContainText('Submitted')
})

test('a complaint with a photo is listed as Submitted with a CMP- reference', async ({ page }) => {
  await page.goto('/complaints')
  await page.getByRole('button', { name: 'New complaint' }).click()
  const dialog = page.getByRole('dialog', { name: 'New submission' })

  await dialog.getByLabel('Category', { exact: true }).click()
  await page.getByRole('option', { name: 'Product Quality' }).click()
  await dialog.getByLabel('Complaint type').click()
  await page.getByRole('option', { name: 'Damaged Bags' }).click()
  await dialog.getByLabel('Subject').fill(`${STAMP} complaint`)
  await dialog.getByLabel('Description').fill('Automated check; safe to ignore.')
  await dialog.getByLabel('Attach a photo or document (optional)').setInputFiles({ name: 'e2e.png', mimeType: 'image/png', buffer: PHOTO })
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click()

  await expect(page.getByText(/Complaint CMP-\d+ submitted\./)).toBeVisible()
  const top = page.getByRole('table').getByRole('row').nth(1)
  await expect(top).toContainText(`${STAMP} complaint`)
  await expect(top).toContainText(/CMP-\d+/)
  await expect(top).toContainText('Submitted')
})
