import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The webhook flow can't run locally; these pin its security- and data-relevant parts (S4-07, real-time status).

const load = (file: string) => JSON.parse(readFileSync(resolve('scripts/dataverse', file), 'utf8'))

function findAction(actions: Record<string, any>, name: string): any {
  for (const [key, action] of Object.entries(actions)) {
    if (key === name) return action
    for (const child of [action.actions, action.else?.actions].filter(Boolean)) {
      const found = findAction(child, name)
      if (found) return found
    }
  }
  return undefined
}

function allActions(actions: Record<string, any>): [string, any][] {
  return Object.entries(actions).flatMap(([name, action]) => [
    [name, action] as [string, any],
    ...[action.actions, action.else?.actions].filter(Boolean).flatMap(allActions),
  ])
}

const webhook = load('service_webhook_flow.json')
const sync = load('service_sync_flow.json')

test('an anonymous HTTP trigger, since monday cannot sign in', () => {
  const [trigger] = Object.values(webhook.triggers) as any[]
  expect(trigger).toMatchObject({ type: 'Request', kind: 'Http', inputs: { triggerAuthenticationType: 'All' } })
  // Power Automate rejects a concurrency limit on a flow with a Response action (InvalidConcurrencyConfiguration, seen on Dev).
  expect(trigger.runtimeConfiguration).toBeUndefined()
})

test("answers monday's challenge with the same value", () => {
  const answer = findAction(webhook.actions, 'Answer_challenge')
  expect(answer.type).toBe('Response')
  expect(answer.inputs.body).toEqual({ challenge: "@triggerBody()?['challenge']" })
})

test('only the item id from the payload reaches Dataverse, forced to a number', () => {
  expect(findAction(webhook.actions, 'Item_id').inputs).toBe("@string(int(triggerBody()?['event']?['pulseId']))")
  for (const name of ['List_requests_to_read', 'List_complaints_to_read']) {
    expect(findAction(webhook.actions, name).inputs.parameters.$filter).toBe("chp_mondayitemid eq '@{outputs('Item_id')}'")
  }
  const text = JSON.stringify(webhook)
  expect(text.match(/triggerBody\(\)\?\['event'\]\?\['(\w+)'\]/g)?.map((m) => m.split("'")[3]).sort()).toEqual(['boardId', 'boardId', 'pulseId'])
  expect(text).not.toMatch(/\['value'\]|\['label'\]/)
})

test('each board runs only on its own board id', () => {
  expect(findAction(webhook.actions, 'Requests_board').expression.equals[1]).toBe("@parameters('monday.com Requests board ID (chp_MondayRequestsBoardId)')")
  expect(findAction(webhook.actions, 'Complaints_board').expression.equals[1]).toBe("@parameters('monday.com Complaints board ID (chp_MondayComplaintsBoardId)')")
})

test('reads, maps and writes exactly as the scheduled sync does, and never re-sends', () => {
  const same = [
    'Read_request_items', 'Request_item_values', 'Request_item_entries', 'Request_items_by_id', 'Request_updates', 'Changed_requests', 'For_each_changed_request',
    'Read_complaint_items', 'Complaint_item_values', 'Complaint_item_entries', 'Complaint_items_by_id', 'Complaint_updates', 'Changed_complaints', 'For_each_changed_complaint',
  ]
  for (const name of same) expect(findAction(webhook.actions, name), name).toEqual(findAction(sync.actions, name))
  expect(allActions(webhook.actions).map(([name]) => name).filter((name) => /resend/i.test(name))).toEqual([])
})

test('the token comes only from the environment variable, and HTTP inputs and outputs are secured', () => {
  expect(webhook.parameters['monday API Token (chp_MondayAPIToken)']).toMatchObject({ defaultValue: '', metadata: { schemaName: 'chp_MondayAPIToken' } })
  const calls = allActions(webhook.actions).filter(([, a]) => a.type === 'Http')
  expect(calls).toHaveLength(2)
  for (const [, action] of calls) {
    expect(action.inputs.headers.Authorization).toBe("@parameters('monday API Token (chp_MondayAPIToken)')")
    expect(action.runtimeConfiguration.secureData.properties).toEqual(['inputs', 'outputs'])
  }
})
