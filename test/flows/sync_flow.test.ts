import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The sync flow can't run locally; these pin the security- and data-relevant parts of its definition (S4-07).

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

function load() {
  const path = resolve('scripts/dataverse', 'service_sync_flow.json')
  expect(existsSync(path), 'service_sync_flow.json exists').toBe(true)
  return JSON.parse(readFileSync(path, 'utf8'))
}

const TOKEN = "@parameters('monday API Token (chp_MondayAPIToken)')"
const SUBMITTED = 775000000
const IN_REVIEW = 775000001
const RESOLVED = 775000002
const PENDING = 775000000
const FAILED = 775000002
const SHORTCUT = 'shortcut: re-sends every 10 min without a cap; add a max-attempts stop if ops see repeat failures'

const http = (definition: any) => allActions(definition.actions).filter(([, a]) => a.type === 'Http')

test('runs every 10 minutes, one run at a time', () => {
  const definition = load()
  const [trigger] = Object.values(definition.triggers) as any[]
  expect(trigger.type).toBe('Recurrence')
  expect(trigger.recurrence).toMatchObject({ frequency: 'Minute', interval: 10 })
  expect(trigger.runtimeConfiguration).toEqual({ concurrency: { runs: 1 } })
})

test('the token comes only from the environment variable, and HTTP inputs and outputs are secured', () => {
  const definition = load()
  expect(definition.parameters['monday API Token (chp_MondayAPIToken)']).toMatchObject({
    defaultValue: '',
    type: 'String',
    metadata: { schemaName: 'chp_MondayAPIToken' },
  })
  const calls = http(definition)
  expect(calls.map(([name]) => name).sort()).toEqual(['Read_complaint_items', 'Read_request_items'])
  for (const [, action] of calls) {
    expect(action.inputs.uri).toBe("@parameters('monday.com API URL (chp_MondayApiUrl)')")
    expect(action.inputs.headers).toEqual({ Authorization: TOKEN, 'API-Version': '2026-10', 'Content-Type': 'application/json' })
    // Status reads are idempotent queries, so they keep the retries.
    expect(action.inputs.retryPolicy).toMatchObject({ type: 'exponential', count: 4 })
    expect(action.runtimeConfiguration.secureData.properties).toEqual(expect.arrayContaining(['inputs', 'outputs']))
  }
  expect(JSON.stringify(definition)).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/)
})

test('a GraphQL error fails the run', () => {
  const definition = load()
  // monday answers HTTP 200 with errors[]: each call checks it and throws.
  for (const [name] of http(definition)) {
    const check = allActions(definition.actions).find(([, a]) => a.type === 'If' && JSON.stringify(a.expression).includes(`body('${name}')?['errors']`))
    expect(check, `${name} has an errors check`).toBeDefined()
    expect(check![1].actions[`Throw_${name}`]).toMatchObject({ type: 'Compose', runAfter: { [`Fail_${name}`]: ['Succeeded'] }, inputs: '@div(1, 0)' })
  }
})

test('the two tables sync in parallel branches', () => {
  const definition = load()
  expect(definition.actions.Sync_requests).toMatchObject({ type: 'Scope', runAfter: {} })
  expect(definition.actions.Sync_complaints).toMatchObject({ type: 'Scope', runAfter: {} })
})

const TABLES = [
  { table: 'request', entity: 'chp_requests', idColumn: 'chp_requestid', columns: 'monday.com Requests column map (chp_MondayRequestsColumns)', resolution: false },
  { table: 'complaint', entity: 'chp_complaints', idColumn: 'chp_complaintid', columns: 'monday.com Complaints column map (chp_MondayComplaintsColumns)', resolution: true },
]

describe.each(TABLES)('the $table branch', ({ table, entity, idColumn, columns, resolution }) => {
  const T = table[0].toUpperCase() + table.slice(1)
  const read = (definition: any) => findAction(definition.actions, `Read_${table}_items`)

  test('reads the rows that have a monday item and are open or were resolved in the last 7 days', () => {
    const definition = load()
    const list = findAction(definition.actions, `List_${table}s_to_read`)
    expect(list.inputs.host.operationId).toBe('ListRecords')
    expect(list.inputs.parameters.entityName).toBe(entity)
    expect(list.inputs.parameters.$filter).toBe(
      `chp_mondayitemid ne null and (chp_status ne ${RESOLVED} or chp_dateresolved ge @{formatDateTime(addDays(utcNow(), -7), 'yyyy-MM-dd')})`,
    )
    const select = list.inputs.parameters.$select.split(',')
    expect(select).toEqual(expect.arrayContaining([idColumn, 'chp_mondayitemid', 'chp_status', 'chp_dateresolved']))
    expect(select.includes('chp_resolution')).toBe(resolution)
  })

  test('asks monday only for item ids the portal stored', () => {
    const definition = load()
    const query = read(definition).inputs.body.query as string
    expect(query).toContain('items(ids: $ids, limit: 100)')
    expect(query).not.toContain('items_page')
    expect(read(definition).inputs.body.variables.ids).toBe(`@body('${T}_item_ids')`)
    expect(findAction(definition.actions, `${T}_item_ids`)).toMatchObject({
      type: 'Select',
      inputs: { from: `@items('For_each_${table}_chunk')`, select: "@item()?['chp_mondayitemid']" },
    })
  })

  test('batches at most 100 item ids per call', () => {
    const definition = load()
    const loop = findAction(definition.actions, `For_each_${table}_chunk`)
    expect(loop.foreach).toBe(`@chunk(outputs('List_${table}s_to_read')?['body/value'], 100)`)
    expect(loop.actions[`Read_${table}_items`]).toBeDefined()
  })

  test('row values go in GraphQL variables, never into the query text', () => {
    const definition = load()
    const query = read(definition).inputs.body.query as string
    // '@include' is a GraphQL directive; only a leading '@' or '@{' would make the text a flow expression.
    expect(query).not.toMatch(/@\{|body\/chp_|outputs\(|variables\(|item\(/)
    expect(query.startsWith('@')).toBe(false)
  })

  test('asks only for the mapped columns, and skips a column the board does not have', () => {
    const definition = load()
    const { query, variables } = read(definition).inputs.body
    const map = `outputs('${T}_columns')`
    expect(findAction(definition.actions, `${T}_columns`).inputs).toBe(`@json(parameters('${columns}'))`)
    expect(variables.status).toEqual([`@${map}?['status']?['id']`])
    // monday returns EVERY column for ids: [], so a column with no id is left out of the query with @include.
    expect(query).toContain('date: column_values(ids: $date) @include(if: $hasDate) { text }')
    expect(variables.hasDate).toBe(`@not(empty(${map}?['dateResolved']?['id']))`)
    expect(variables.date).toBe(`@if(empty(${map}?['dateResolved']?['id']), json('[]'), createArray(${map}?['dateResolved']?['id']))`)
    if (resolution) {
      expect(query).toContain('resolution: column_values(ids: $resolution) @include(if: $hasResolution) { text }')
      expect(variables.hasResolution).toBe(`@not(empty(${map}?['resolution']?['id']))`)
    } else {
      expect(query).not.toContain('resolution')
    }
  })

  test('maps Resolved, Submitted/empty and every other label to the portal status', () => {
    const definition = load()
    const status = findAction(definition.actions, `${T}_item_values`).inputs.select.status as string
    for (const part of ["'Resolved'", "'Submitted'", "''", String(RESOLVED), String(SUBMITTED), String(IN_REVIEW)]) expect(status).toContain(part)
    expect(status).toBe(
      `@if(equals(coalesce(first(item()?['status'])?['text'], ''), 'Resolved'), ${RESOLVED}, if(contains(createArray('', 'Submitted'), coalesce(first(item()?['status'])?['text'], '')), ${SUBMITTED}, ${IN_REVIEW}))`,
    )
  })

  test('Resolved takes the board date, else keeps the stored date, else today; other statuses clear it', () => {
    const definition = load()
    const values = findAction(definition.actions, `${T}_item_values`).inputs.select
    expect(values.date).toBe("@take(coalesce(first(coalesce(item()?['date'], json('[]')))?['text'], ''), 10)")
    const date = findAction(definition.actions, `${T}_updates`).inputs.select.date as string
    expect(date).toContain(`equals(outputs('${T}_items_by_id')?[item()?['chp_mondayitemid']]?['status'], ${RESOLVED})`)
    expect(date).toContain("formatDateTime(utcNow(), 'yyyy-MM-dd')")
    expect(date).toContain(`equals(item()?['chp_status'], ${RESOLVED})`)
    expect(date.endsWith(", '')")).toBe(true)
  })

  test('writes a row only when its status, date or resolution changed, and only for items monday returned', () => {
    const definition = load()
    const changed = findAction(definition.actions, `Changed_${table}s`)
    expect(changed.type).toBe('Query')
    expect(changed.inputs.from).toBe(`@body('${T}_updates')`)
    const where = changed.inputs.where as string
    expect(where.startsWith("@and(item()?['found'], or(")).toBe(true)
    expect(where).toContain("not(equals(item()?['status'], item()?['oldStatus']))")
    expect(where).toContain("not(equals(item()?['date'], item()?['oldDate']))")
    expect(where.includes("not(equals(item()?['resolution'], item()?['oldResolution']))")).toBe(resolution)
    const loop = findAction(definition.actions, `For_each_changed_${table}`)
    expect(loop.foreach).toBe(`@body('Changed_${table}s')`)
    const update = loop.actions[`Update_${table}_status`]
    expect(update.inputs.host.operationId).toBe('UpdateOnlyRecord')
    const row = `items('For_each_changed_${table}')`
    const expected: Record<string, unknown> = {
      entityName: entity,
      recordId: `@${row}?['id']`,
      'item/chp_status': `@${row}?['status']`,
      'item/chp_dateresolved': `@if(empty(${row}?['date']), null, ${row}?['date'])`,
    }
    if (resolution) expected['item/chp_resolution'] = `@${row}?['resolution']`
    // Exact parameters: the status write never touches chp_syncstate/chp_syncattempts, so it can't re-fire the send flow.
    expect(update.inputs.parameters).toEqual(expected)
  })

  if (resolution) {
    test('a board without a Resolution column leaves chp_resolution as stored', () => {
      const definition = load()
      expect(findAction(definition.actions, 'Complaint_updates').inputs.select.resolution).toBe(
        "@if(empty(outputs('Complaint_columns')?['resolution']?['id']), coalesce(item()?['chp_resolution'], ''), coalesce(outputs('Complaint_items_by_id')?[item()?['chp_mondayitemid']]?['resolution'], ''))",
      )
    })
  }

  test('re-sends Failed rows and Pending rows older than 10 minutes by bumping chp_syncattempts', () => {
    const definition = load()
    const list = findAction(definition.actions, `List_${table}s_to_resend`)
    expect(list.runAfter).toEqual({})
    expect(list.inputs.parameters.entityName).toBe(entity)
    expect(list.inputs.parameters.$filter).toBe(
      `chp_mondayitemid eq null and (chp_syncstate eq ${FAILED} or (chp_syncstate eq ${PENDING} and createdon lt @{formatDateTime(addMinutes(utcNow(), -10), 'yyyy-MM-ddTHH:mm:ssZ')}))`,
    )
    const loop = findAction(definition.actions, `For_each_${table}_resend`)
    expect(loop.foreach).toBe(`@outputs('List_${table}s_to_resend')?['body/value']`)
    expect(loop.description).toContain(SHORTCUT)
    const update = loop.actions[`Resend_${table}`]
    expect(update.inputs.host.operationId).toBe('UpdateOnlyRecord')
    expect(update.inputs.parameters).toEqual({
      entityName: entity,
      recordId: `@items('For_each_${table}_resend')?['${idColumn}']`,
      'item/chp_syncstate': PENDING,
      'item/chp_syncattempts': `@add(coalesce(items('For_each_${table}_resend')?['chp_syncattempts'], 0), 1)`,
    })
    // The re-send never calls monday: the send flow's trigger, re-read guard and Reference lookup do.
    expect(allActions(loop.actions).some(([, a]) => a.type === 'Http')).toBe(false)
  })
})
