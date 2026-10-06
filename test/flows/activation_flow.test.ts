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

test('every Power Pages response returns status ok, and there is one per business outcome', () => {
  const responses = actions.filter(([, a]) => a.type === 'Response' && a.kind === 'PowerPages')
  expect(responses.length).toBeGreaterThanOrEqual(3)
  for (const [, a] of responses) expect(a.inputs.body).toEqual({ status: 'ok' })
})

test('actions that handle the client secret or the token hide their inputs and outputs', () => {
  const sensitive = actions.filter(([, a]) => /ClientSecret|client_secret|access_token/i.test(JSON.stringify(a.inputs ?? {})))
  expect(sensitive.length).toBeGreaterThan(0)
  for (const [name, a] of sensitive) {
    expect(a.runtimeConfiguration?.secureData?.properties, name).toEqual(expect.arrayContaining(['inputs', 'outputs']))
  }
})

test('creates a single-use invitation linked to the site from the environment variable', () => {
  const [, invite] = actions.find(([, a]) => a.inputs?.parameters?.entityName === 'adx_invitations')!
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
