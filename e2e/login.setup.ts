import { expect, test as setup } from '@playwright/test'

// Signs in by hand (no password in the repo) and saves the session for `npm run e2e`. The file holds session cookies
// (the private site's Microsoft sign-in and the portal's): it is git-ignored and must never be shared.
// Starts at the site root: while the site is private, Power Pages first sends a new browser to Microsoft sign-in, and a
// deep link like /orders/new only gets a blank page because its scripts are redirected there instead.
setup('sign in by hand and save the session', async ({ page }) => {
  await page.goto('/')
  console.log(
    'In the Chrome window: 1) sign in with your Microsoft work account if asked (private site), 2) sign in to the portal ' +
      'with a Full Access or Orders & Delivery test user, 3) open Orders → New Order. Waiting up to 10 minutes…',
  )
  await expect(page.getByRole('table', { name: 'Order lines' })).toBeVisible({ timeout: 600_000 })
  await page.context().storageState({ path: 'e2e/.auth/user.json' })
})
