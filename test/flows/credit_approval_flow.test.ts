import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The flow can't run locally; this pins the money and safety rules in its definition (S3-04, spec §4).
const definition = JSON.parse(readFileSync(resolve('scripts/dataverse/credit_approval_flow.json'), 'utf8'))
const text = JSON.stringify(definition)
type Action = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const flat = (actions: Record<string, Action>): [string, Action][] =>
  Object.entries(actions).flatMap(([n, a]) => [[n, a] as [string, Action], ...flat(a.actions ?? {}), ...flat(a.else?.actions ?? {})])
const actions = flat(definition.actions)
const action = (name: string) => actions.find(([n]) => n === name)![1]
const decision = action('Approved')

test('runs when the portal adds a credit approval row', () => {
  const [trigger] = Object.values(definition.triggers) as Action[]
  expect(trigger.inputs.host.operationId).toBe('SubscribeWebhookTrigger')
  expect(trigger.inputs.parameters).toMatchObject({
    'subscriptionRequest/message': 1,
    'subscriptionRequest/entityname': 'chp_creditapproval',
    'subscriptionRequest/scope': 4,
  })
})

test('asks the credit team group, first to respond, with no item link and no timeout of our own', () => {
  const approval = action('Start_and_wait_for_an_approval')
  expect(approval.inputs.host).toMatchObject({ connectionName: 'shared_approvals', operationId: 'StartAndWaitForAnApproval' })
  const p = approval.inputs.parameters
  expect(p.approvalType).toBe('Basic')
  expect(p['WebhookApprovalCreationInput/assignedTo']).toBe("@{parameters('Credit Approval Group (chp_CreditApprovalGroup)')}")
  expect(p['WebhookApprovalCreationInput/title']).toMatch(/^Credit approval: .* — ₱/)
  expect(Object.keys(p).some((k) => /itemLink/i.test(k))).toBe(false)
  expect(approval.limit).toBeUndefined()
  for (const field of ['chp_reason', 'chp_availablecredit', 'chp_overdueamount', 'chp_estimatedtotal', "body('Line_rows')"]) {
    expect(p['WebhookApprovalCreationInput/details'], field).toContain(field)
  }
})

test('Approve marks the row Approved before BC; Reject marks it Declined and never calls BC', () => {
  expect(JSON.stringify(decision.expression)).toContain("\"@outputs('Start_and_wait_for_an_approval')?['body/outcome']\",\"Approve\"")
  expect(decision.actions.Set_status_Approved.inputs.parameters['item/chp_status']).toBe(775000001)
  const declined = decision.else.actions
  expect(declined.Set_status_Declined.inputs.parameters['item/chp_status']).toBe(775000002)
  expect(JSON.stringify(declined)).not.toContain('Http')
})

test('a resubmitted run stops before BC when the row already has an SO number', () => {
  const guard = action('Already_created')
  expect(guard.runAfter).toEqual({ Get_credit_approval: ['Succeeded'] })
  expect(JSON.stringify(guard.expression)).toContain("@empty(outputs('Get_credit_approval')?['body/chp_salesorderno'])")
  expect(guard.actions.Stop_already_created).toMatchObject({ type: 'Terminate', inputs: { runStatus: 'Succeeded' } })
  expect(action('Get_BC_token').runAfter).toEqual({ Already_created: ['Succeeded'] })
})

test("posts the stored BC body once to the payload's company and keeps the SO number", () => {
  const post = action('Create_BC_order')
  expect(post.inputs.method).toBe('POST')
  expect(post.inputs.uri).toBe("@{outputs('BC_api_root')}companies(@{outputs('Payload')?['companyId']})/mcrmSalesOrders")
  expect(post.inputs.body).toBe("@outputs('Payload')?['salesOrder']")
  expect(post.inputs.retryPolicy).toEqual({ type: 'none' })
  expect(action('Save_SO_number').inputs.parameters['item/chp_salesorderno']).toBe("@{body('Create_BC_order')?['salesOrderNo']}")
})

test('a BC failure emails the credit team and ends the run Failed', () => {
  const mail = action('Email_credit_team')
  expect(mail.runAfter).toEqual({ Create_BC_order: ['Failed', 'TimedOut'] })
  expect(mail.inputs.parameters['emailMessage/Subject']).toBe("Approved credit order couldn't be created in Business Central")
  expect(action('Stop_BC_failed')).toMatchObject({ type: 'Terminate', inputs: { runStatus: 'Failed' }, runAfter: { Email_credit_team: ['Succeeded'] } })
})

test('sends no email to the customer', () => {
  const mails = actions.filter(([, a]) => a.inputs?.host?.operationId === 'SendEmailV2')
  expect(mails.map(([n]) => n)).toEqual(['Email_credit_team'])
  expect(mails[0][1].inputs.parameters).toMatchObject({
    'emailMessage/From': "@{parameters('Sender Mailbox (chp_SenderMailbox)')}",
    'emailMessage/To': "@{parameters('Credit Approval Group (chp_CreditApprovalGroup)')}",
  })
})

test('hides the client secret and the token from run history', () => {
  const sensitive = actions.filter(([, a]) => /client_secret|access_token/i.test(JSON.stringify(a.inputs ?? {})))
  expect(sensitive.map(([n]) => n).sort()).toEqual(['Create_BC_order', 'Get_BC_token'])
  for (const [name, a] of sensitive) expect(a.runtimeConfiguration?.secureData?.properties, name).toContain('inputs')
})

test('reads every environment-specific value from a ConcreatHub environment variable, never a literal', () => {
  const schemaNames = Object.values(definition.parameters).map((p) => (p as Action).metadata?.schemaName).filter(Boolean)
  expect(schemaNames.sort()).toEqual(
    ['chp_BCApiBasePath', 'chp_BCClientId', 'chp_BCClientSecret', 'chp_BCEnvironmentName', 'chp_BCTenantId', 'chp_CreditApprovalGroup', 'chp_SenderMailbox'],
  )
  for (const p of Object.values(definition.parameters) as Action[]) if (p.metadata?.schemaName) expect(p.defaultValue).toBe('')
  expect(text).not.toMatch(/f44e98b4|d2e4496e|6b92847e|188fc244|chp-portal-dev|automations365|chp-credit-team/)
})
