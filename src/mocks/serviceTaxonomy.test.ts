import wireframe from '../../docs/Mockup-chp-v2.html?raw' // read-only: the wireframe is the source
import taxonomy from './serviceTaxonomy.json'

test('Nov 15 request categories are the six the plan names, in wireframe order', () => {
  expect(taxonomy.requests.filter((c) => c.active).map((c) => c.category)).toEqual([
    'Sales Order', 'Trip Reference', 'Delivery', 'Document Copy', 'CHP Ordering Tool', 'Other Request',
  ])
  expect(taxonomy.requests.filter((c) => !c.active).map((c) => c.category)).toEqual([
    'Adjustment', 'Customer Account', 'Sample Request', 'Account Receivables', 'Technical Client Visit',
  ])
})

test('type counts match the wireframe taxonomies', () => {
  expect(taxonomy.requests.flatMap((c) => c.types)).toHaveLength(39)
  expect(taxonomy.requests.filter((c) => c.active).flatMap((c) => c.types)).toHaveLength(16)
  expect(taxonomy.complaints.map((c) => [c.category, c.types.length])).toEqual([
    ['Billing & Documentation', 4], ['Delivery & Handling', 19], ['Product Quality', 12], ['Safety Incident', 3],
  ])
})

test('active categories use only the field keys the Nov 15 forms build', () => {
  const keys = new Set(taxonomy.requests.filter((c) => c.active).flatMap((c) => c.fields.rows))
  expect([...keys].sort()).toEqual(['docdate', 'docref', 'order', 'site', 'trip', 'userEmail'])
  expect(taxonomy.requests.find((c) => c.category === 'Sales Order')!.fields.orderLabel).toBe('Sales Order Number')
  expect(taxonomy.requests.find((c) => c.category === 'Delivery')!.fields).toEqual({ rows: ['trip', 'order', 'site'], orderLabel: 'Related Sales Order' })
})

describe('taxonomy matches the wireframe', () => {
  const html = wireframe.split('\n')
  const literal = (name: string) => {
    const start = html.findIndex((l) => l.includes(`const ${name} = {`))
    const end = html.findIndex((l, i) => i > start && /^\s*};\s*$/.test(l))
    const text = html.slice(start, end + 1).join('\n').replace(/^\s*const \w+ = /, '').replace(/;\s*$/, '')
    return new Function('return ' + text)() as Record<string, any>
  }

  test('request types and fields', () => {
    const types = literal('REQUEST_TAXONOMY')
    const fields = literal('REQUEST_CATEGORY_FIELDS')
    expect(taxonomy.requests.map((c) => c.category).sort()).toEqual(Object.keys(types).sort())
    for (const c of taxonomy.requests) {
      expect(c.types).toEqual(types[c.category])
      expect(c.fields).toEqual(fields[c.category])
    }
  })

  test('complaint types', () => {
    const types = literal('COMPLAINT_TAXONOMY')
    expect(taxonomy.complaints.map((c) => c.category)).toEqual(Object.keys(types))
    for (const c of taxonomy.complaints) expect(c.types).toEqual(types[c.category])
  })
})
