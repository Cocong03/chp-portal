import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const definition = JSON.parse(readFileSync(resolve('scripts/dataverse/password_reset_flow.json'), 'utf8'))
const text = JSON.stringify(definition)
type Action = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const flat = (actions: Record<string, Action>): [string, Action][] =>
  Object.entries(actions).flatMap(([n, a]) => [[n, a] as [string, Action], ...flat(a.actions ?? {}), ...flat(a.else?.actions ?? {})])
const actions = flat(definition.actions)
const action = (name: string) => actions.find(([n]) => n === name)![1]

test('runs when Dataverse adds a password reset email', () => {
  const [trigger] = Object.values(definition.triggers) as Action[]
  expect(trigger.inputs.parameters).toMatchObject({
    'subscriptionRequest/message': 1,
    'subscriptionRequest/entityname': 'email',
    // Final review D: only outgoing emails tied to a record (Power Pages' reset is regarding the contact), so tracked
    // inbound mail or other apps' "Password Reset" emails in the same environment are never re-sent as Concreat email.
    'subscriptionRequest/filterexpression': "contains(subject,'Password Reset') and directioncode eq true and _regardingobjectid_value ne null",
  })
})

test("sends the branded email to the contact's address with our reset link", () => {
  const mail = action('Send_reset_email').inputs.parameters
  expect(mail['emailMessage/To']).toBe("@{outputs('Get_contact')?['body/emailaddress1']}")
  expect(mail['emailMessage/Subject']).toBe('Reset your Concreat Connect password')
  expect(mail['emailMessage/Body']).toContain("/reset-password?@{outputs('Reset_query')}&amp;email=@{encodeUriComponent(outputs('Get_contact')?['body/emailaddress1'])}")
  expect(mail['emailMessage/Body']).toContain('This link expires in 1 hour.')
})

test('fails the run (sends nothing) when the reset link is missing', () => {
  expect(action('Has_reset_link').else.actions.Stop_no_link).toMatchObject({ type: 'Terminate', inputs: { runStatus: 'Failed' } })
})

test('cancels the Dataverse email so nothing sends it again', () => {
  expect(action('Cancel_dataverse_email').inputs.parameters).toMatchObject({ entityName: 'emails', 'item/statecode': 2, 'item/statuscode': 5 })
})

test('reads the site URL from its environment variable', () => {
  expect(Object.values(definition.parameters).map((p) => (p as Action).metadata?.schemaName).filter(Boolean)).toEqual(['chp_SiteUrl'])
  expect(text).not.toMatch(/f44e98b4|chp-portal-dev|automations365/)
})

// Seen on Dev 2026-10-06: Power Pages writes the link as href='…' (single quotes). Cutting only at a double quote kept the
// trailing HTML ("'>Reset…</a>") in the query, and Power Pages rejected the URL with a server error.
// The link appears twice: in href='…' and again as plain text ("Or you can copy the following URL…"), which has no
// closing quote. Take the first occurrence (the href) and cut at its closing quote.
test('takes the first reset link (the href) and cuts it at the closing quote, single or double', () => {
  expect(action('Reset_query').inputs).toBe(
    "@replace(first(split(first(split(split(triggerOutputs()?['body/description'], 'ResetPassword?')[1], '''')), '\"')), '&amp;', '&')",
  )
})
