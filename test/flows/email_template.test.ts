import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Both portal emails come from scripts/dataverse/email_template.py, so they share one branded layout.
const body = (file: string, action: string) => {
  const definition = JSON.parse(readFileSync(resolve(`scripts/dataverse/${file}`), 'utf8'))
  const find = (actions: Record<string, any>): any => // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.entries(actions ?? {}).reduce<any>( // eslint-disable-line @typescript-eslint/no-explicit-any
      (hit, [name, a]) => hit ?? (name === action ? a : find(a.actions) ?? find(a.else?.actions)),
      undefined,
    )
  return find(definition.actions).inputs.parameters['emailMessage/Body'] as string
}
const activation = body('activation_flow.json', 'Send_activation_email')
const reset = body('password_reset_flow.json', 'Send_reset_email')
const SITE = "@{parameters('Site URL (chp_SiteUrl)')}"
// The logo must be public even while the site is private (email clients fetch it anonymously): its own env var.
const LOGO = "@{parameters('Email Logo URL (chp_EmailLogoUrl)')}"

test.each([
  ['activation', activation, 'Activate your account', 'This link can be used once and expires in 24 hours.'],
  ['reset', reset, 'Reset your password', 'This link expires in 1 hour.'],
])('the %s email uses the branded layout', (_name, html, heading, expiry) => {
  expect(html).toContain(`<img src="${LOGO}"`)
  expect(html).toContain('alt="CONCREAT"')
  expect(html).toContain('Concreat Connect')
  expect(html).toContain(`>${heading}</h1>`)
  expect(html).toContain('Button not working? Copy and paste this link into your browser:')
  expect(html).toContain(expiry)
  expect(html).toContain('Concreat Customer Service Center')
  expect(html).toContain('(02) 8849-3600')
  expect(html).toContain("Didn't ask for this? You can safely ignore this email.")
})

test('the button and the copy-link fallback point to the same link', () => {
  for (const [html, path] of [
    [activation, "/activate/complete?code=@{outputs('Invitation_code')}&amp;email=@{encodeUriComponent(outputs('Email'))}"],
    [reset, "/reset-password?@{outputs('Reset_query')}&amp;email=@{encodeUriComponent(outputs('Get_contact')?['body/emailaddress1'])}"],
  ]) {
    expect(html.split(`href="${SITE}${path}"`).length - 1).toBe(2)
  }
})

test('both emails share the same header', () => {
  const header = (html: string) => html.slice(0, html.indexOf('<h1'))
  expect(header(activation)).toBe(header(reset))
})
