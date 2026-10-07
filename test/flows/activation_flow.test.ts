import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Same layout as grant_flow.json: the file is the flow definition; activation_flow.py wraps it in clientdata.
const definition = JSON.parse(readFileSync(resolve('scripts/dataverse/activation_flow.json'), 'utf8'))
const text = JSON.stringify(definition)

type Action = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
function allActions(actions: Record<string, Action>, out: [string, Action][] = []): [string, Action][] {
  for (const [name, action] of Object.entries(actions ?? {})) {
    out.push([name, action])
    const children = [action.actions, action.else?.actions, action.default?.actions, ...Object.values(action.cases ?? {}).map((c: Action) => c.actions)]
    for (const child of children) if (child) allActions(child, out)
  }
  return out
}
const actions = allActions(definition.actions)

test('is triggered by Power Pages with a single Email input', () => {
  const [trigger] = Object.values(definition.triggers) as Action[]
  expect(trigger.type).toBe('Request')
  expect(trigger.kind).toBe('PowerPages')
  expect(Object.values(trigger.inputs.schema.properties).map((p) => (p as Action).title)).toEqual(['Email'])
})

test('matches BC contacts by lower-cased email, with quotes doubled', () => {
  expect(text).toMatch(/tolower\(eMail\) eq/)
  expect(text).toMatch(/toLower\(trim\(/)
  expect(text).toContain("replace(outputs('Email'), '''', '''''')")
})

// Decided 2026-10-06: BC's customerPortalAccess flag decides who may activate, and only those contacts count
// towards the Q10 several-customers rule (customers come only from the filtered contacts' companies).
test('only BC contacts with customer portal access can activate or count towards Q10', () => {
  const [, contacts] = actions.find(([name]) => name === 'Get_BC_contacts')!
  expect(contacts.inputs.queries.$filter).toBe("tolower(eMail) eq '@{outputs('Email_literal')}' and customerPortalAccess eq true")
  const [, companies] = actions.find(([name]) => name === 'Company_no_list')!
  expect(companies.inputs.from).toBe("@body('Get_BC_contacts')?['value']")
})

test('resolves customers through business relations linked to Customer', () => {
  expect(text).toContain('mcrmBusinessRelation')
  expect(text).toContain("linktoTable eq 'Customer'")
  // Each company no. goes into the filter with its quotes doubled.
  expect(text).toContain("concat('contactNo eq ''', replace(item(), '''', ''''''), '''')")
})

test('each business outcome returns its status to Power Pages', () => {
  const statusOf = (name: string) => actions.find(([n]) => n === name)![1].inputs.body
  for (const name of ['Return_invalid_email', 'Return_no_match', 'Return_no_customer', 'Return_sent']) {
    expect(statusOf(name), name).toEqual({ status: 'ok' })
  }
  for (const name of ['Return_several_customers', 'Return_several_contacts', 'Return_linked_elsewhere']) {
    expect(statusOf(name), name).toEqual({ status: 'needs_help' })
  }
  expect(statusOf('Return_already_active')).toEqual({ status: 'already_active' })
})

test('a new request cancels the contact\'s earlier unused links before creating one that lasts 24 hours', () => {
  const [, list] = actions.find(([n]) => n === 'List_open_invitations')!
  expect(list.inputs.parameters.$filter).toBe(
    "_adx_invitecontact_value eq @{variables('ContactId')} and statecode eq 0 and (adx_redemptions eq null or adx_redemptions eq 0)",
  )
  const [, cancel] = actions.find(([n]) => n === 'Cancel_invitation')!
  expect(cancel.inputs.parameters).toMatchObject({ entityName: 'adx_invitations', 'item/statecode': 1, 'item/statuscode': 2 })
  const [, code] = actions.find(([n]) => n === 'Invitation_code')!
  expect(code.runAfter).toEqual({ Cancel_earlier_invitations: ['Succeeded'] })
  const [, create] = actions.find(([n]) => n === 'Create_invitation')!
  expect(create.runAfter).toEqual({ Invitation_code: ['Succeeded'] })
  expect(create.inputs.parameters['item/adx_expirydate']).toBe('@{addHours(utcNow(), 24)}')
})

test('the email links to Set password with the code and the email, and says 24 hours', () => {
  const [, mail] = actions.find(([n]) => n === 'Send_activation_email')!
  const body = mail.inputs.parameters['emailMessage/Body']
  expect(body).toContain("/activate/complete?code=@{outputs('Invitation_code')}&amp;email=@{encodeUriComponent(outputs('Email'))}")
  expect(body).toContain('This link can be used once and expires in 24 hours.')
})

test('actions that handle the client secret or the token hide their inputs and outputs', () => {
  const sensitive = actions.filter(([, a]) => /ClientSecret|client_secret|access_token/i.test(JSON.stringify(a.inputs ?? {})))
  expect(sensitive.length).toBeGreaterThan(0)
  for (const [name, a] of sensitive) {
    expect(a.runtimeConfiguration?.secureData?.properties, name).toEqual(expect.arrayContaining(['inputs', 'outputs']))
  }
})

test('creates a single-use invitation linked to the site from the environment variable', () => {
  const [, invite] = actions.find(([name]) => name === 'Create_invitation')!
  expect(invite.inputs.parameters['item/adx_maximumredemptions']).toBe(1)
  expect(invite.inputs.parameters['item/mspp_websiteid@odata.bind']).toContain('chp_PowerPagesSiteId')
})

test('reads every environment-specific value from a ConcreatHub environment variable, never a literal', () => {
  const schemaNames = Object.values(definition.parameters)
    .map((p) => (p as Action).metadata?.schemaName)
    .filter(Boolean)
  expect(schemaNames.sort()).toEqual(
    ['chp_BCApiBasePath', 'chp_BCClientId', 'chp_BCClientSecret', 'chp_BCEnvironmentName', 'chp_BCSolidCementCompanyId', 'chp_BCTenantId', 'chp_PowerPagesSiteId', 'chp_SenderMailbox', 'chp_SiteUrl'],
  )
  for (const p of Object.values(definition.parameters) as Action[]) if (p.metadata?.schemaName) expect(p.defaultValue).toBe('')
  expect(text).not.toMatch(/f44e98b4|d2e4496e|188fc244|chp-portal-dev|automations365/)
})

// Seen on Dev 2026-10-06: Power Pages treats an unconfirmed email as "user does not exist" for password resets.
// Activation proves the address (the person signs in only through the link emailed to it), so mark it confirmed.
test('marks the contact email confirmed for new and existing contacts', () => {
  const [, create] = actions.find(([name]) => name === 'Create_contact')!
  expect(create.inputs.parameters['item/adx_identity_emailaddress1confirmed']).toBe(true)
  const [, confirm] = actions.find(([name]) => name === 'Confirm_contact_email')!
  expect(confirm.inputs.parameters).toMatchObject({
    entityName: 'contacts', recordId: "@variables('ContactId')", 'item/adx_identity_emailaddress1confirmed': true,
  })
})

// Full-branch review 2026-10-07: anonymous requests could flood a customer's inbox and keep cancelling their link.
// Cooldown: an unused invitation newer than 10 minutes means no new email; the page still says "Check your email".
test('an unused invitation from the last 10 minutes ends the run with ok and sends nothing new', () => {
  const [, list] = actions.find(([n]) => n === 'List_open_invitations')!
  expect(list.inputs.parameters.$select).toBe('adx_invitationid,createdon')
  const [, recent] = actions.find(([n]) => n === 'Recent_invitations')!
  expect(recent.inputs.where).toBe("@greater(ticks(item()?['createdon']), ticks(addMinutes(utcNow(), -10)))")
  const [, cooldown] = actions.find(([n]) => n === 'Cooldown')!
  expect(cooldown.runAfter).toEqual({ Recent_invitations: ['Succeeded'] })
  expect(cooldown.actions.Return_cooldown.inputs.body).toEqual({ status: 'ok' })
  expect(cooldown.actions.Stop_cooldown).toMatchObject({ type: 'Terminate', inputs: { runStatus: 'Succeeded' } })
  const [, cancel] = actions.find(([n]) => n === 'Cancel_earlier_invitations')!
  expect(cancel.runAfter).toEqual({ Cooldown: ['Succeeded'] })
})
