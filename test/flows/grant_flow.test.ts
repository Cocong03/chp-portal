import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The flow can't run locally; this pins the security-relevant condition in its definition.
const definition = JSON.parse(readFileSync(resolve('scripts/dataverse/grant_flow.json'), 'utf8'))

function findAction(actions: Record<string, any>, name: string): any {
  for (const [key, action] of Object.entries(actions)) {
    if (key === name) return action
    const nested = [action.actions, action.else?.actions, action.default?.actions, ...Object.values(action.cases ?? {}).map((c: any) => c.actions)]
    for (const child of nested.filter(Boolean)) {
      const found = findAction(child, name)
      if (found) return found
    }
  }
  return undefined
}

test('a grant only applies when its customer no. is present (blank never matches blank)', () => {
  const conditions = JSON.stringify(findAction(definition.actions, 'Customer_matches').expression)
  // Logic Apps conditions have no "empty" operator: compare the @empty() function to false (Dev rejected the operator form).
  expect(conditions).toContain(`{"equals":["@empty(triggerOutputs()?['body/chp_bccustomerno'])",false]}`)
})
