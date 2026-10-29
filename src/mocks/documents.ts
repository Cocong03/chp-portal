import type { DocumentDto, DocumentFileDto, DocumentPageDto } from '@/api/types'
import type { MockRequest } from './index'

// Wireframe DOCUMENTS (Mockup-chp-v2.html); poRef from the matching LEDGER_ENTRIES refPo. Mock data only.
export const MOCK_DOCUMENTS: DocumentDto[] = [
  { type: 'Invoice', ref: 'INV-88611', soNo: 'SO-100478', poRef: 'PO-8858', date: '2026-09-12', amount: 63250 },
  { type: 'Delivery Receipt', ref: 'PWS-100478', soNo: 'SO-100478', poRef: null, date: '2026-09-11', amount: null },
  { type: 'Invoice', ref: 'INV-88604', soNo: 'SO-100471', poRef: 'PO-8849', date: '2026-09-10', amount: 195000 },
  { type: 'Invoice', ref: 'INV-88598', soNo: 'SO-100448', poRef: 'PO-8705', date: '2026-08-15', amount: 167500 },
  { type: 'Invoice', ref: 'INV-88532', soNo: 'SO-100421', poRef: 'PO-8672', date: '2026-08-05', amount: 42500 },
  { type: 'Acknowledgement Receipt', ref: 'PMT-20441', soNo: null, poRef: null, date: '2026-08-05', amount: 320000 },
  { type: 'Invoice', ref: 'INV-88490', soNo: 'SO-100366', poRef: 'PO-8544', date: '2026-07-10', amount: 320000 },
  { type: 'Credit Memo', ref: 'CM-1042', soNo: null, poRef: null, date: '2026-07-01', amount: 15000 },
  { type: 'Acknowledgement Receipt', ref: 'PMT-20398', soNo: null, poRef: null, date: '2026-07-15', amount: 210000 },
  { type: 'Invoice', ref: 'INV-88455', soNo: 'SO-100312', poRef: 'PO-8388', date: '2026-06-20', amount: 210000 },
]

const newestFirst = (a: DocumentDto, b: DocumentDto) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref)

/** Answers like the `documents` endpoint: newest first, 10 per page, all=true returns every row. */
export function documentsMock({ query = {} }: MockRequest): DocumentPageDto {
  const q = (query.q ?? '').trim().toLowerCase()
  const has = (value: string | null) => (value ?? '').toLowerCase().includes(q)
  const rows = MOCK_DOCUMENTS.filter(
    (d) =>
      (!query.type || d.type === query.type) &&
      (!q || has(d.ref) || has(d.soNo) || has(d.poRef)) &&
      (!query.from || d.date >= query.from) &&
      (!query.to || d.date <= query.to),
  ).sort(newestFirst)
  if (query.all === 'true') return { documents: rows, total: rows.length, page: 1, pageSize: rows.length }
  const page = Math.max(1, Number(query.page) || 1)
  return { documents: rows.slice((page - 1) * 10, page * 10), total: rows.length, page, pageSize: 10 }
}

// A one-page PDF with no content, enough for a viewer to open.
const BLANK_PDF =
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'

export function documentFileMock({ query = {} }: MockRequest): DocumentFileDto | { notFound: true } {
  const doc = MOCK_DOCUMENTS.find((d) => d.type === query.type && d.ref === query.no)
  if (!doc) return { notFound: true }
  return { fileName: `${doc.type} ${doc.ref}.pdf`, contentType: 'application/pdf', base64: btoa(BLANK_PDF) }
}
