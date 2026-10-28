import { expect, test } from '@playwright/test'

// S4-04 / S4-05 / S4-07: submit a request and a complaint on the deployed Dev site.
// WARNING: each test writes a real Dataverse row and, through the send flows, a real monday item on the Dev boards.
// Nothing is cleaned up; find the leftovers by their "E2E <timestamp>" text.
const STAMP = `E2E ${new Date().toISOString()}`
const PDF = Buffer.from('%PDF-1.4\n%E2E\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
// 32x32 blue PNG (monday rejects a 1x1 image: "Could not identify image size")
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR42mOQi1pAU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAJHrYD0sqTFGAAAAAElFTkSuQmCC', 'base64')

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

test('a request with an affected user, mobile contact, additional info and a PDF is listed as Submitted', async ({ page }) => {
  await page.goto('/requests')
  await page.getByRole('button', { name: 'New request' }).click()
  const dialog = page.getByRole('dialog', { name: 'New request' })

  await dialog.getByLabel('Category', { exact: true }).click()
  await page.getByRole('option', { name: 'CHP Ordering Tool' }).click()
  await dialog.getByLabel('Request type').click()
  await page.getByRole('option', { name: 'Technical Support' }).click()
  await dialog.getByLabel('Affected user email').fill('e2e.user@sample-customer.ph')
  await dialog.getByLabel('Request details').fill(`${STAMP} tool`)
  await dialog.getByLabel('Additional information (optional)').fill('Automated check of the additional info column.')
  await dialog.getByRole('radio', { name: 'Mobile' }).click()
  await dialog.getByLabel('Mobile number').fill('0917 552 6613')
  await dialog.getByLabel('Attach a supporting document (optional)').setInputFiles({ name: 'e2e.pdf', mimeType: 'application/pdf', buffer: PDF })
  await dialog.getByRole('button', { name: 'Submit request' }).click()

  await expect(page.getByText(/Request RQ-\d+ submitted\./)).toBeVisible()
  const top = page.getByRole('table').getByRole('row').nth(1)
  await expect(top).toContainText(`${STAMP} tool`)
  await expect(top).toContainText('Submitted')
})

test('a Delivery request with a trip, order and site is listed as Submitted', async ({ page }) => {
  await page.goto('/requests')
  await page.getByRole('button', { name: 'New request' }).click()
  const dialog = page.getByRole('dialog', { name: 'New request' })

  await dialog.getByLabel('Category', { exact: true }).click()
  await page.getByRole('option', { name: 'Delivery', exact: true }).click()
  await dialog.getByLabel('Request type').click()
  await page.getByRole('option').first().click()
  await dialog.getByLabel('Trip ID reference').fill('TRP-E2E-01')
  const order = dialog.getByLabel('Related Sales Order')
  // With no orders the picker is locked and says so, instead of opening an empty box.
  await expect(order).toContainText(/Select a sales order|No sales orders on your account/, { timeout: 60_000 })
  if (await order.isDisabled()) {
    await expect(order).toContainText('No sales orders on your account')
    test.skip(true, 'The test customer has no BC orders on Dev, so a Delivery request (sales order required) cannot be completed')
  }
  await order.click()
  await page.getByRole('option').first().click()
  await dialog.getByLabel('Delivery site (Ship-to Address)').click()
  await page.getByRole('option').first().click()
  await dialog.getByLabel('Request details').fill(`${STAMP} delivery`)
  await dialog.getByRole('button', { name: 'Submit request' }).click()

  await expect(page.getByText(/Request RQ-\d+ submitted\./)).toBeVisible()
  const top = page.getByRole('table').getByRole('row').nth(1)
  await expect(top).toContainText(`${STAMP} delivery`)
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

test('a Delivery & Handling complaint with a delivery site is listed as Submitted', async ({ page }) => {
  await page.goto('/complaints')
  await page.getByRole('button', { name: 'New complaint' }).click()
  const dialog = page.getByRole('dialog', { name: 'New submission' })

  await dialog.getByLabel('Category', { exact: true }).click()
  await page.getByRole('option', { name: 'Delivery & Handling' }).click()
  await dialog.getByLabel('Complaint type').click()
  await page.getByRole('option', { name: 'Delivery Delay' }).click()
  await dialog.getByLabel('Delivery site (optional)').click()
  // A customer with no sites still submits (Not Applicable): the "&" in the category once broke every such submit.
  const sites = page.getByRole('option').filter({ hasNotText: 'Not Applicable' })
  await ((await sites.count()) ? sites.first() : page.getByRole('option', { name: 'Not Applicable' })).click()
  await dialog.getByLabel('Subject').fill(`${STAMP} site`)
  await dialog.getByLabel('Description').fill('Automated check of the delivery site code; safe to ignore.')
  await dialog.getByRole('radio', { name: 'Mobile' }).click()
  await dialog.getByRole('textbox', { name: 'Mobile number' }).fill('+639175526613')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click()

  await expect(page.getByText(/Complaint CMP-\d+ submitted\./)).toBeVisible()
  const top = page.getByRole('table').getByRole('row').nth(1)
  await expect(top).toContainText(`${STAMP} site`)
  await expect(top).toContainText(/CMP-\d+/)
  await expect(top).toContainText('Submitted')
})

test('a Billing & Documentation complaint with a PDF and a date of incident is listed as Submitted', async ({ page }) => {
  await page.goto('/complaints')
  await page.getByRole('button', { name: 'New complaint' }).click()
  const dialog = page.getByRole('dialog', { name: 'New submission' })

  await dialog.getByLabel('Category', { exact: true }).click()
  await page.getByRole('option', { name: 'Billing & Documentation' }).click()
  await dialog.getByLabel('Complaint type').click()
  await page.getByRole('option', { name: 'Incorrect Invoice' }).click()
  await dialog.getByLabel('Date of incident (optional)').click()
  await page.getByRole('gridcell').getByRole('button').first().click()
  await dialog.getByLabel('Subject').fill(`${STAMP} billing`)
  await dialog.getByLabel('Description').fill('Automated check of a category with "&"; safe to ignore.')
  await dialog.getByLabel('Attach a photo or document (optional)').setInputFiles({ name: 'e2e.pdf', mimeType: 'application/pdf', buffer: PDF })
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click()

  await expect(page.getByText(/Complaint CMP-\d+ submitted\./)).toBeVisible()
  const top = page.getByRole('table').getByRole('row').nth(1)
  await expect(top).toContainText(`${STAMP} billing`)
  await expect(top).toContainText('Submitted')
})
