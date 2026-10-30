import type { ComplaintDto, ComplaintTaxonomyDto, RequestDto, RequestTaxonomyDto } from '@/api/types'
import { mocks } from './index'
import { resetServiceMocks } from './service'

beforeEach(resetServiceMocks)

test('requests mock: taxonomy has the active categories, POST adds a Submitted row at the top', () => {
  const taxonomy = mocks.requests!({ method: 'GET', query: { taxonomy: '1' } }) as RequestTaxonomyDto
  expect(taxonomy.categories.map((c) => c.name)).toEqual([
    'Sales Order', 'Trip Reference', 'Delivery', 'Document Copy', 'CHP Ordering Tool', 'Other Request',
  ])
  const result = mocks.requests!({
    method: 'POST',
    body: { category: 'Sales Order', requestType: 'Inquiry', contactMethod: 'Email', contactValue: 'a@b.ph', details: 'Where is it?', additionalInfo: '', fields: { order: 'SO-1' } },
  })
  expect(result).toEqual({ ref: 'RQ-30104', id: expect.any(String) })
  const [first] = mocks.requests!({ method: 'GET' }) as RequestDto[]
  expect(first).toMatchObject({ ref: 'RQ-30104', status: 'Submitted', assignedGroup: 'Service Center', extra: [{ label: 'Sales Order Number', value: 'SO-1' }] })
})

test('complaints mock: taxonomy has the categories, POST adds a Submitted row at the top', () => {
  const taxonomy = mocks.complaints!({ method: 'GET', query: { taxonomy: '1' } }) as ComplaintTaxonomyDto
  expect(taxonomy.categories).toHaveLength(4)
  const result = mocks.complaints!({
    method: 'POST',
    body: { category: 'Delivery & Handling', complaintType: 'Missing Bags (Short Delivery)', contactMethod: 'Email', contactValue: 'a@b.ph', incidentDate: '2026-10-01', site: '', relatedOrder: '', subject: 's', description: 'd', consent: true },
  })
  expect(result).toEqual({ ref: 'CMP-20106', id: expect.any(String) })
  const [first] = mocks.complaints!({ method: 'GET' }) as ComplaintDto[]
  expect(first).toMatchObject({ ref: 'CMP-20106', status: 'Submitted', assignedGroup: 'Logistics' })
})
