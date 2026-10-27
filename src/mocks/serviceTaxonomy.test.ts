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
