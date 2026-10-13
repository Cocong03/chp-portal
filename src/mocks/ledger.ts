import type { LedgerEntryDto, LedgerPageDto } from '@/api/types'
import type { MockRequest } from './index'

// Wireframe LEDGER_ENTRIES (Mockup-chp-v2.html). Mock data only; the real entries come from BC.
export const MOCK_LEDGER: LedgerEntryDto[] = [
  { docNo: 'INV-88611', refPo: 'PO-8858', type: 'Invoice', desc: 'September cement delivery', postingDate: '2026-09-12', dueDate: '2026-10-12', original: 63250, remaining: 63250, status: 'Open' },
  { docNo: 'INV-88604', refPo: 'PO-8849', type: 'Invoice', desc: 'September cement delivery', postingDate: '2026-09-10', dueDate: '2026-10-10', original: 195000, remaining: 195000, status: 'Open' },
  { docNo: 'INV-88598', refPo: 'PO-8705', type: 'Invoice', desc: 'August cement delivery', postingDate: '2026-08-15', dueDate: '2026-09-14', original: 167500, remaining: 167500, status: 'Open' },
  { docNo: 'INV-88532', refPo: 'PO-8672', type: 'Invoice', desc: 'August cement delivery', postingDate: '2026-08-05', dueDate: '2026-08-20', original: 42500, remaining: 42500, status: 'Open' },
  { docNo: 'PMT-20441', refPo: null, type: 'Payment', desc: 'Bank transfer applied to INV-88490', postingDate: '2026-08-05', dueDate: null, original: -320000, remaining: 0, status: 'Closed' },
  { docNo: 'INV-88490', refPo: 'PO-8544', type: 'Invoice', desc: 'July cement delivery', postingDate: '2026-07-10', dueDate: '2026-08-09', original: 320000, remaining: 0, status: 'Closed' },
  { docNo: 'CM-1042', refPo: null, type: 'Credit Memo', desc: 'Return — damaged bags', postingDate: '2026-07-01', dueDate: null, original: -15000, remaining: 0, status: 'Closed' },
  { docNo: 'PMT-20398', refPo: null, type: 'Payment', desc: 'Bank transfer applied to INV-88455', postingDate: '2026-07-15', dueDate: null, original: -210000, remaining: 0, status: 'Closed' },
  { docNo: 'INV-88455', refPo: 'PO-8388', type: 'Invoice', desc: 'June cement delivery', postingDate: '2026-06-20', dueDate: '2026-07-20', original: 210000, remaining: 0, status: 'Closed' },
]

const newestFirst = (a: LedgerEntryDto, b: LedgerEntryDto) =>
  b.postingDate.localeCompare(a.postingDate) || b.docNo.localeCompare(a.docNo)

/** Answers like the `ledger` endpoint: open only unless show=all, newest first, 10 per page. */
export function ledgerMock({ query = {} }: MockRequest): LedgerPageDto {
  const q = (query.q ?? '').trim().toLowerCase()
  const rows = MOCK_LEDGER.filter(
    (e) =>
      (query.show === 'all' || e.status === 'Open') &&
      (!query.type || e.type === query.type) &&
      (!q || e.docNo.toLowerCase().includes(q) || (e.refPo ?? '').toLowerCase().includes(q) || e.desc.toLowerCase().includes(q)) &&
      (!query.from || e.postingDate >= query.from) &&
      (!query.to || e.postingDate <= query.to),
  ).sort(newestFirst)
  const page = Math.max(1, Number(query.page) || 1)
  return { entries: rows.slice((page - 1) * 10, page * 10), total: rows.length, page, pageSize: 10 }
}
