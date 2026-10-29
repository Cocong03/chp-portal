import type { DraftDto } from '@/api/types'
import type { MockRequest } from './index'

const SAMPLE: DraftDto = {
  id: '6f1c2a3e-5b7d-4e8f-9a0b-1c2d3e4f5a01',
  label: 'Draft #1',
  savedAt: '2026-10-20T09:15:00Z',
  payload: {
    version: 1,
    orderType: 'single',
    form: {
      orderType: 'single',
      lines: [{ code: 'CEM-T1-40KG', qty: 10 }],
      shipmentMethod: 'delivery',
      source: 'PLANT1',
      pickupDate: '',
      receivingPerson: 'Ramon Cruz',
      receivingContact: '(02) 8531-4420',
      receivingEmail: '',
      requestedDate: '2099-10-28', // far future: a past date fails New Order's date check
      timeWindow: '7:00 – 9:00 AM',
      loadingType: 'Loose pile',
      callBefore: false,
      paymentMethod: 'cash',
      instructions: 'Loading type: Loose pile',
      site: 'PLANT2',
      poRef: 'PO-8915',
      schedule: [],
    },
  },
}

// The dev server's drafts, kept in memory like the drafts Server Logic keeps them in Dataverse.
let drafts: DraftDto[] = []

/** Back to the one sample draft. Tests call it so each starts from the same list. */
export function resetDraftsMock() {
  drafts = [structuredClone(SAMPLE)]
}
resetDraftsMock()

const valid = (body: unknown) => {
  const payload = (body as { payload?: { version?: unknown } } | undefined)?.payload
  return typeof payload === 'object' && payload !== null && payload.version === 1 ? (payload as DraftDto['payload']) : null
}

/** Answers like the drafts Server Logic (S3-12). */
export function draftsMock({ method, query = {}, body }: MockRequest) {
  const found = drafts.find((draft) => draft.id === query.id)
  switch (method) {
    case 'GET':
      if (query.id !== undefined) return found ?? { notFound: true }
      return [...drafts].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    case 'POST': {
      const payload = valid(body)
      if (!payload) return { invalid: true }
      const next = 1 + Math.max(0, ...drafts.map((draft) => Number(/^Draft #(\d+)$/.exec(draft.label)?.[1] ?? 0)))
      const created: DraftDto = { id: crypto.randomUUID(), label: `Draft #${next}`, savedAt: new Date().toISOString(), payload }
      drafts.push(created)
      return created
    }
    case 'PUT': {
      if (!found) return { notFound: true }
      const payload = valid(body)
      if (!payload) return { invalid: true }
      Object.assign(found, { payload, savedAt: new Date().toISOString() })
      return found
    }
    case 'DELETE':
      if (!found) return { notFound: true }
      drafts = drafts.filter((draft) => draft !== found)
      return { removed: true }
    default:
      return { notFound: true }
  }
}
