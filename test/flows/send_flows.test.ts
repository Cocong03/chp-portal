import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The send flows can't run locally; these pin the security- and data-relevant parts of their definitions (S4-07).

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

// Every action at any depth, with its name.
function allActions(actions: Record<string, any>): [string, any][] {
  return Object.entries(actions).flatMap(([name, action]) => {
    const nested = [action.actions, action.else?.actions, action.default?.actions, ...Object.values(action.cases ?? {}).map((c: any) => c.actions)]
    return [[name, action] as [string, any], ...nested.filter(Boolean).flatMap(allActions)]
  })
}

function load(file: string) {
  const path = resolve('scripts/dataverse', file)
  expect(existsSync(path), `${file} exists`).toBe(true)
  return JSON.parse(readFileSync(path, 'utf8'))
}

const TOKEN = "@parameters('monday API Token (chp_MondayAPIToken)')"
const PENDING = 775000000
const SENT = 775000001
const FAILED = 775000002

const FLOWS = [
  { flow: 'request', file: 'request_send_flow.json', table: 'chp_request', idColumn: 'chp_requestid', neverWritten: ['salesOrder', 'relatedSalesOrder', 'site', 'assignedGroup'] },
  { flow: 'complaint', file: 'complaint_send_flow.json', table: 'chp_complaint', idColumn: 'chp_complaintid', neverWritten: ['relatedOrder', 'salesOrder', 'site', 'assignedGroup'] },
]

describe.each(FLOWS)('the $flow send flow', ({ file, table, idColumn, neverWritten }) => {
  const http = (definition: any) => allActions(definition.actions).filter(([, a]) => a.type === 'Http')
  const graphql = (definition: any) => http(definition).filter(([, a]) => typeof a.inputs.body?.query === 'string')

  test('fires only for rows without a monday item that are Pending', () => {
    const definition = load(file)
    const [trigger] = Object.values(definition.triggers) as any[]
    expect(trigger.inputs.parameters).toMatchObject({
      'subscriptionRequest/message': 4,
      'subscriptionRequest/entityname': table,
      'subscriptionRequest/filteringattributes': 'chp_syncattempts,chp_syncstate',
    })
    expect(trigger.conditions).toEqual([
      { expression: `@and(empty(triggerOutputs()?['body/chp_mondayitemid']), equals(triggerOutputs()?['body/chp_syncstate'], ${PENDING}))` },
    ])
  })

  test('the token comes only from the environment variable, and HTTP inputs and outputs are secured', () => {
    const definition = load(file)
    expect(definition.parameters['monday API Token (chp_MondayAPIToken)']).toMatchObject({
      defaultValue: '',
      type: 'String',
      metadata: { schemaName: 'chp_MondayAPIToken' },
    })
    const calls = http(definition)
    expect(calls.map(([name]) => name)).toEqual(expect.arrayContaining(['Find_existing_item', 'Create_item', 'Upload_file']))
    for (const [, action] of calls) {
      expect(action.inputs.headers.Authorization).toBe(TOKEN)
      expect(action.inputs.headers['API-Version']).toBe('2026-10')
      expect(action.inputs.retryPolicy).toMatchObject({ type: 'exponential', count: 4 })
      expect(action.runtimeConfiguration.secureData.properties).toEqual(expect.arrayContaining(['inputs', 'outputs']))
    }
    for (const [, action] of graphql(definition)) expect(action.inputs.headers['Content-Type']).toBe('application/json')
    expect(JSON.stringify(definition)).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/)
  })

  test('row values go in GraphQL variables, never into the query text', () => {
    const definition = load(file)
    const queries = graphql(definition).map(([, a]) => a.inputs.body.query as string)
    expect(queries).toHaveLength(2)
    for (const query of queries) {
      expect(query).not.toMatch(/@\{|body\/chp_|outputs\(|variables\(/)
      expect(query.startsWith('@')).toBe(false)
    }
    // The file endpoint takes the file as the only variable (Task 0 spike): the query carries just monday's own item id, as a
    // number, and the file column id from the column map. No row value.
    const parts = findAction(definition.actions, 'Upload_file').inputs.body.$multipart
    const query = parts.find((p: any) => p.headers['Content-Disposition'] === 'form-data; name="query"').body as string
    const known = query.replace("@{int(variables('ItemId'))}", '').replace("@{outputs('Columns')?['file']?['id']}", '')
    expect(known).not.toMatch(/@|body\/chp_|outputs\(/)
    expect(query).toContain('file: $file')
  })

  test('never creates labels on CHP\'s boards, and never writes the dropdown or formula columns', () => {
    const definition = load(file)
    const text = JSON.stringify(definition)
    expect(text).not.toContain('create_labels_if_missing')
    for (const key of neverWritten) expect(text).not.toContain(`['${key}']`)
  })

  test('looks for an existing item with the same reference before creating one', () => {
    const definition = load(file)
    const send = definition.actions.Send_to_monday
    const find = findAction(send.actions, 'Find_existing_item')
    expect(find.inputs.body.query).toContain('items_page_by_column_values')
    expect(JSON.stringify(find.inputs.body.variables)).toContain("?['reference']?['id']")
    const branch = findAction(send.actions, 'Existing_item_found')
    expect(JSON.stringify(branch.expression)).toContain("body('Find_existing_item')")
    expect(Object.keys(branch.runAfter)).toEqual(['Check_find'])
    expect(findAction(branch.actions, 'Create_item')).toBeUndefined()
    expect(findAction(branch.else.actions, 'Create_item')).toBeDefined()
    expect(findAction(definition.actions, 'Create_item').inputs.body.query).toBe(
      'mutation ($board: ID!, $group: String!, $name: String!, $values: JSON!) { create_item(board_id: $board, group_id: $group, item_name: $name, column_values: $values) { id } }',
    )
  })

  test('a GraphQL error or a missing attachment fails the send', () => {
    const definition = load(file)
    // monday answers HTTP 200 with errors[] (e.g. ColumnValueException for an unknown label): each call checks it.
    for (const [name] of http(definition)) {
      const check = allActions(definition.actions).find(([, a]) => a.type === 'If' && JSON.stringify(a.expression).includes(`body('${name}')?['errors']`))
      expect(check, `${name} has an errors check`).toBeDefined()
      expect(check![1].actions[`Fail_${name}`]).toBeDefined()
      expect(JSON.stringify(check![1].actions)).toContain('"name":"Failure"')
    }
    const attachment = findAction(definition.actions, 'Check_attachment')
    expect(JSON.stringify(attachment.expression)).toContain("body/chp_attachmentname")
    expect(JSON.stringify(attachment.expression)).toContain("outputs('List_notes')")
    expect(JSON.stringify(attachment.actions)).toContain('attachment not found yet')
  })

  test('a failure marks the row Failed with the error', () => {
    const definition = load(file)
    const catcher = definition.actions.Mark_failed
    expect(catcher.type).toBe('Scope')
    expect(catcher.runAfter).toEqual({ Send_to_monday: ['Failed', 'TimedOut'] })
    const update = findAction(catcher.actions, 'Set_sync_failed')
    expect(update.inputs.host.operationId).toBe('UpdateOnlyRecord')
    expect(update.inputs.parameters).toMatchObject({
      recordId: `@triggerOutputs()?['body/${idColumn}']`,
      'item/chp_syncstate': FAILED,
      'item/chp_syncerror': "@take(outputs('Error_text'), 2000)",
    })
    expect(JSON.stringify(findAction(catcher.actions, 'Error_text').inputs)).toContain("variables('Failure')")
  })

  test('a success writes the item id and Sent, and keeps only the group note', () => {
    const definition = load(file)
    const update = findAction(definition.actions.Send_to_monday.actions, 'Set_sync_sent')
    expect(update.inputs.parameters).toMatchObject({
      'item/chp_mondayitemid': "@variables('ItemId')",
      'item/chp_syncstate': SENT,
      'item/chp_syncerror': "@variables('SyncNote')",
    })
    expect(JSON.stringify(findAction(definition.actions, 'Set_sync_note').inputs)).toContain('group not found')
  })
})

test('requests put the order, trip and site values as a labelled block above the details', () => {
  const definition = load('request_send_flow.json')
  expect(JSON.stringify(findAction(definition.actions, 'Block_fields').inputs.where)).toContain("createArray('order', 'trip', 'site')")
  expect(findAction(definition.actions, 'Block_lines').inputs.select).toBe("@concat(item()?['label'], ': ', item()?['value'])")
  // chp_fields keys that have their own text/date/email column; order and site are dropdowns and never written.
  expect(findAction(definition.actions, 'Field_columns').inputs.select.id).toContain("createArray('trip', 'docref', 'docdate', 'userEmail')")
})

test('complaints put the related order and delivery site as a labelled block above the description', () => {
  const definition = load('complaint_send_flow.json')
  const lines = JSON.stringify(findAction(definition.actions, 'Block_lines').inputs)
  expect(lines).toContain("'Related order: '")
  expect(lines).toContain("'Delivery site: '")
})
