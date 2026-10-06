import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const definition = JSON.parse(readFileSync(resolve('scripts/dataverse/check_link_flow.json'), 'utf8'))
const text = JSON.stringify(definition)
type Action = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const flat = (actions: Record<string, Action>): [string, Action][] =>
  Object.entries(actions).flatMap(([n, a]) => [[n, a] as [string, Action], ...flat(a.actions ?? {}), ...flat(a.else?.actions ?? {})])
const actions = flat(definition.actions)

test('is triggered by Power Pages with a single Code input', () => {
  const [trigger] = Object.values(definition.triggers) as Action[]
  expect([trigger.type, trigger.kind]).toEqual(['Request', 'PowerPages'])
  expect(Object.values(trigger.inputs.schema.properties).map((p) => (p as Action).title)).toEqual(['Code'])
})

test('looks the code up among active invitations, with quotes doubled', () => {
  const [, list] = actions.find(([n]) => n === 'List_invitation')!
  expect(list.inputs.parameters.entityName).toBe('adx_invitations')
  expect(list.inputs.parameters.$filter).toBe("adx_invitationcode eq '@{replace(outputs('Code'), '''', '''''')}' and statecode eq 0")
})

test('answers only valid or invalid, valid only when unexpired with redemptions left', () => {
  const responses = actions.filter(([, a]) => a.type === 'Response').map(([, a]) => a.inputs.body.status)
  expect(responses.sort()).toEqual(['invalid', 'valid'])
  expect(text).toContain('adx_expirydate')
  expect(text).toContain('adx_maximumredemptions')
})

test('holds no environment-specific values', () => {
  expect(text).not.toMatch(/f44e98b4|d2e4496e|188fc244|chp-portal-dev|automations365/)
})
