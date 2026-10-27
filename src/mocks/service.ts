import type {
  ComplaintDto, ComplaintSubmitDto, ComplaintTaxonomyDto, RequestDto, RequestSubmitDto, RequestTaxonomyDto,
} from '@/api/types'
import type { MockRequest } from './index'
import taxonomy from './serviceTaxonomy.json'

const REQUEST_TAXONOMY: RequestTaxonomyDto = {
  categories: taxonomy.requests.filter((c) => c.active).map((c) => ({ name: c.category, fields: c.fields, types: c.types })),
}
const COMPLAINT_TAXONOMY: ComplaintTaxonomyDto = {
  categories: taxonomy.complaints.map((c) => ({ name: c.category, types: c.types })),
}

const ME = 'J.D. Santos'
const EMAIL = 'jd.santos@sample-customer.ph'
const SITE_LABEL = 'PLANT1 — Plant 1 — Main Yard'

// Wireframe REQUESTS
const REQUEST_SAMPLES: RequestDto[] = [
  { id: 'a1000000-0000-4000-8000-000000030101', ref: 'RQ-30101', submitted: '2026-09-03T08:00:00Z', category: 'Sales Order', requestType: 'Modification', assignedGroup: 'Service Center', contactMethod: 'Email', contactValue: EMAIL, contactPerson: ME, details: 'Please move the delivery date on SO-100467 to next Friday if the plant can still accommodate it.', additionalInfo: '', attachmentName: '', extra: [{ label: 'Sales Order Number', value: 'SO-100467' }], status: 'In Review' },
  { id: 'a1000000-0000-4000-8000-000000030102', ref: 'RQ-30102', submitted: '2026-09-09T08:00:00Z', category: 'Delivery', requestType: 'Concern', assignedGroup: 'Logistics', contactMethod: 'Mobile', contactValue: '0917 552 6613', contactPerson: ME, details: "Delivery for SO-100482 was scheduled for this morning but the truck hasn't arrived yet — can someone check the trip status?", additionalInfo: 'Site is open until 6 PM today.', attachmentName: '', extra: [{ label: 'Trip ID reference', value: 'TRP-88231' }, { label: 'Related Sales Order', value: 'SO-100482' }, { label: 'Delivery site (Ship-to Address)', value: 'PLANT3 — Plant 3 — Warehouse A' }], status: 'Submitted' },
  { id: 'a1000000-0000-4000-8000-000000030103', ref: 'RQ-30103', submitted: '2026-08-28T08:00:00Z', category: 'Document Copy', requestType: 'Delivery Receipt (DR)', assignedGroup: 'Service Center', contactMethod: 'Email', contactValue: EMAIL, contactPerson: ME, details: 'Requesting a copy of the delivery receipt for the pickup completed against SO-100455.', additionalInfo: '', attachmentName: '', extra: [{ label: 'Document reference', value: 'DR-100455-01' }, { label: 'Date of document', value: '2026-08-27' }], status: 'Resolved' },
]

// Wireframe COMPLAINTS
const COMPLAINT_SAMPLES: ComplaintDto[] = [
  { id: 'b2000000-0000-4000-8000-000000020101', ref: 'CMP-20101', submitted: '2026-09-02T08:00:00Z', category: 'Delivery & Handling', complaintType: 'Missing Bags (Short Delivery)', assignedGroup: 'Logistics', incidentDate: '2026-09-01', deliverySite: SITE_LABEL, subject: 'Short delivery on SO-100467', description: 'Delivery arrived roughly 40 bags short of what was ordered against SO-100467.', relatedOrder: 'SO-100467', contactMethod: 'Email', contactValue: EMAIL, contactPerson: ME, attachmentName: 'delivery-shortage-photo.jpg', status: 'Resolved', dateResolved: '2026-09-05', resolutionNote: 'Shortage confirmed against the delivery ticket and credited on Acknowledgement Receipt PMT-20441; the balance was re-delivered 2026-09-05.' },
  { id: 'b2000000-0000-4000-8000-000000020102', ref: 'CMP-20102', submitted: '2026-09-11T08:00:00Z', category: 'Billing & Documentation', complaintType: 'Incorrect Invoice', assignedGroup: 'Finance', incidentDate: '2026-09-10', deliverySite: '', subject: 'Invoice amount does not match PO', description: 'The amount billed on SO-100482 looks higher than what was quoted on the purchase order.', relatedOrder: 'SO-100482', contactMethod: 'Mobile', contactValue: '0917 552 6613', contactPerson: ME, attachmentName: '', status: 'In Review', dateResolved: '', resolutionNote: '' },
  { id: 'b2000000-0000-4000-8000-000000020104', ref: 'CMP-20104', submitted: '2026-09-13T08:00:00Z', category: 'Product Quality', complaintType: 'Damaged Bags', assignedGroup: 'Technical Services', incidentDate: '2026-09-12', deliverySite: '', subject: 'Bags arrived damp and torn', description: 'A number of bags on this delivery were damp and torn open, cement partly spilled inside the pallet wrap.', relatedOrder: 'SO-100455', contactMethod: 'Email', contactValue: EMAIL, contactPerson: ME, attachmentName: 'damaged-bags-photo.jpg', status: 'Submitted', dateResolved: '', resolutionNote: '' },
  { id: 'b2000000-0000-4000-8000-000000020105', ref: 'CMP-20105', submitted: '2026-09-10T08:00:00Z', category: 'Safety Incident', complaintType: 'Other Safety Concern', assignedGroup: 'Healthy, Safety & Environment', incidentDate: '2026-09-09', deliverySite: '', subject: 'Forklift near-miss during offloading', description: "The delivery crew's forklift nearly struck a staff member while offloading — no injury, but wanted to report it.", relatedOrder: '', contactMethod: 'Email', contactValue: EMAIL, contactPerson: ME, attachmentName: '', status: 'In Review', dateResolved: '', resolutionNote: '' },
]

const FIELD_LABELS: Record<string, string> = {
  trip: 'Trip ID reference',
  site: 'Delivery site (Ship-to Address)',
  docref: 'Document reference',
  docdate: 'Date of document',
  userEmail: 'Affected user email',
}

let requests: RequestDto[] = []
let complaints: ComplaintDto[] = []

/** Back to the wireframe's sample rows. Tests call it so each starts from the same lists. */
export function resetServiceMocks() {
  requests = structuredClone(REQUEST_SAMPLES)
  complaints = structuredClone(COMPLAINT_SAMPLES)
}
resetServiceMocks()

const nextRef = (prefix: string, rows: { ref: string }[]) =>
  `${prefix}-${1 + Math.max(...rows.map((r) => Number(r.ref.split('-')[1])))}`
const newestFirst = <T extends { submitted: string }>(rows: T[]) => [...rows].sort((a, b) => b.submitted.localeCompare(a.submitted))
const groupOf = (types: { type: string; group: string }[] | undefined, type: string) => types?.find((t) => t.type === type)?.group ?? ''

/** Answers like the requests Server Logic (S4-03). The mock does not validate. */
export function requestsMock({ method, query = {}, body }: MockRequest): unknown {
  if (method === 'GET') return query.taxonomy ? REQUEST_TAXONOMY : newestFirst(requests)
  if (method !== 'POST') return { notFound: true }
  const b = body as RequestSubmitDto
  const category = REQUEST_TAXONOMY.categories.find((c) => c.name === b.category)
  const extra = Object.entries(b.fields ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => ({ label: key === 'order' ? (category?.fields.orderLabel ?? 'Sales Order Number') : (FIELD_LABELS[key] ?? key), value }))
  const ref = nextRef('RQ', requests)
  requests.push({
    id: crypto.randomUUID(), ref, submitted: new Date().toISOString(), category: b.category, requestType: b.requestType,
    assignedGroup: groupOf(category?.types, b.requestType), contactMethod: b.contactMethod, contactValue: b.contactValue,
    contactPerson: ME, details: b.details, additionalInfo: b.additionalInfo, attachmentName: b.attachment?.name ?? '', extra, status: 'Submitted',
  })
  return { ref }
}

/** Answers like the complaints Server Logic (S4-04). The mock does not validate. */
export function complaintsMock({ method, query = {}, body }: MockRequest): unknown {
  if (method === 'GET') return query.taxonomy ? COMPLAINT_TAXONOMY : newestFirst(complaints)
  if (method !== 'POST') return { notFound: true }
  const b = body as ComplaintSubmitDto
  const category = COMPLAINT_TAXONOMY.categories.find((c) => c.name === b.category)
  const ref = nextRef('CMP', complaints)
  complaints.push({
    id: crypto.randomUUID(), ref, submitted: new Date().toISOString(), category: b.category, complaintType: b.complaintType,
    assignedGroup: groupOf(category?.types, b.complaintType), incidentDate: b.incidentDate, deliverySite: b.site,
    subject: b.subject, description: b.description, relatedOrder: b.relatedOrder, contactMethod: b.contactMethod,
    contactValue: b.contactValue, contactPerson: ME, attachmentName: b.attachment?.name ?? '', status: 'Submitted', dateResolved: '', resolutionNote: '',
  })
  return { ref }
}
