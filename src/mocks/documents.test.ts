import { documentFileMock, documentsMock } from './documents'

const get = (query: Record<string, string> = {}) => documentsMock({ method: 'GET', query })

test('lists newest first, 10 per page', () => {
  const page = get()
  expect(page).toMatchObject({ total: 10, page: 1, pageSize: 10 })
  expect(page.documents[0].ref).toBe('INV-88611')
})

test('filters by type', () => {
  expect(get({ type: 'Delivery Receipt' }).documents).toEqual([expect.objectContaining({ ref: 'PWS-100478', amount: null })])
})

test('search matches the sales order case-insensitively', () => {
  expect(get({ q: 'so-100478' }).documents.map((d) => d.ref)).toEqual(['INV-88611', 'PWS-100478'])
})

test('search matches the PO reference', () => {
  expect(get({ q: 'po-8849' }).documents.map((d) => d.ref)).toEqual(['INV-88604'])
})

test('filters by posting date range', () => {
  expect(get({ from: '2026-08-01', to: '2026-08-31' }).documents).toHaveLength(3)
})

test('page 2 is empty but keeps the total', () => {
  expect(get({ page: '2' })).toMatchObject({ documents: [], total: 10, page: 2 })
})

test('all=true returns every row on page 1', () => {
  expect(get({ all: 'true' })).toMatchObject({ total: 10, page: 1, pageSize: 10 })
})

test('documentFileMock returns a PDF named after the document', () => {
  const file = documentFileMock({ method: 'GET', query: { type: 'Invoice', no: 'INV-88611' } }) as { fileName: string; contentType: string; base64: string }
  expect(file.fileName).toBe('Invoice INV-88611.pdf')
  expect(file.contentType).toBe('application/pdf')
  expect(atob(file.base64).startsWith('%PDF-')).toBe(true)
})

test('documentFileMock answers notFound for an unknown ref', () => {
  expect(documentFileMock({ method: 'GET', query: { type: 'Invoice', no: 'INV-0' } })).toEqual({ notFound: true })
})
