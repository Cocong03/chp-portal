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

// Decided 2026-10-08: the access grant is the source of truth for a contact's business role.
// Edit → replaces the role · Deactivate → revokes · Activate → restores. Portal Management is no longer needed.
const BUSINESS_ROLES = ['Full Access', 'Orders & Delivery', 'Finance & Documents', 'View Only']
const REVOKED = 775000004

test('the flow also runs when a grant is deactivated or activated', () => {
  const trigger = definition.triggers.When_an_access_grant_is_added_or_modified.inputs.parameters
  expect(trigger['subscriptionRequest/filteringattributes'].split(',')).toEqual(
    expect.arrayContaining(['chp_email', 'chp_bccustomerno', 'chp_webrole', 'statecode']),
  )
})

test("it lists only the contact's business roles on this site", () => {
  const filter: string = findAction(definition.actions, 'List_current_business_roles').inputs.parameters.$filter
  expect(filter).toContain('powerpagecomponenttype eq 11 and _powerpagesiteid_value eq f44e98b4-3da3-4f8d-8f79-fbb244454741')
  for (const role of BUSINESS_ROLES) expect(filter).toContain(`name eq '${role}'`)
  expect(filter).toContain("powerpagecomponent_mspp_webrole_contact/any(c: c/contactid eq @{first(outputs('List_contacts_by_email')?['body/value'])?['contactid']})")
})

test('an active grant removes every other business role before adding its own', () => {
  const remove = findAction(definition.actions, 'Remove_other_business_roles')
  expect(remove.type).toBe('Foreach')
  expect(JSON.stringify(remove.foreach)).toContain("outputs('List_current_business_roles')")
  const unrelate = findAction(remove.actions, 'Unrelate_other_role')
  expect(unrelate.inputs.host.operationId).toBe('DisassociateEntities')
  expect(unrelate.inputs.parameters.associationEntityRelationship).toBe('powerpagecomponent_mspp_webrole_contact')
  // Keeps the grant's own role (no remove-then-add flicker) — compares by name.
  expect(JSON.stringify(findAction(definition.actions, 'Is_other_role').expression)).toContain("outputs('Grant_role_name')")
  expect(findAction(definition.actions, 'List_web_role').runAfter).toEqual({ Remove_other_business_roles: ['Succeeded'] })
})

test('a deactivated grant removes all business roles and is marked Revoked', () => {
  const isActive = findAction(definition.actions, 'Grant_is_active')
  expect(JSON.stringify(isActive.expression)).toContain("triggerOutputs()?['body/statecode']")
  const revoke = isActive.else.actions
  expect(revoke.Remove_all_business_roles.type).toBe('Foreach')
  expect(revoke.Remove_all_business_roles.actions.Unrelate_role.inputs.host.operationId).toBe('DisassociateEntities')
  expect(revoke.Set_status_Revoked.inputs.parameters['item/chp_status']).toBe(REVOKED)
  expect(revoke.Set_status_Revoked.runAfter).toEqual({ Remove_all_business_roles: ['Succeeded'] })
})

test.each(['Set_status_Pending', 'Set_status_Customer_mismatch', 'Set_status_Duplicate_email'])(
  '%s says Revoked instead when the grant was deactivated (no roles touched)',
  (name) => {
    expect(String(findAction(definition.actions, name).inputs.parameters['item/chp_status'])).toContain(
      `if(equals(triggerOutputs()?['body/statecode'], 1), ${REVOKED},`,
    )
  },
)
