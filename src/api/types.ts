import type { NewOrderForm } from '@/modules/orders/new/form'

/** GET /_api/serverlogics/me. Field names follow the wireframe (ACCOUNTS[], CURRENT_USER). */
export interface MeDto {
  contact: { name: string; email: string }
  /** null when the contact isn't linked to a customer account yet. company: "Solid Cement" | "APO Cement" */
  account: { customerNo: string; customerName: string; company: string } | null
  /** Web role names, e.g. "Authenticated Users", "Full Access". */
  roles: string[]
  /** BC switched this contact's portal access off (customerPortalAccess = false). */
  blocked?: boolean
}

/** GET /_api/serverlogics/company. Mirrors the wireframe's ACCOUNTS[] and PORTAL_CONTACTS[]. */
export interface CompanyDto {
  customerNo: string
  customerName: string
  address: string
  /** "" until BC exposes a website on the customer card. */
  website: string
  vatRegNumber: string
  phone: string
  email: string
  contacts: PortalContactDto[]
}

/** BC person contact of the customer, merged with portal activation and web role. */
export interface PortalContactDto {
  name: string
  /** "" until BC exposes a job title on its contacts. */
  title: string
  phone: string
  email: string
  /** Activated on this account + a business web role + BC customerPortalAccess. */
  portalAccess: boolean
  /** Highest business web role; "" when portalAccess is false. */
  portalRole: string
  isYou: boolean
}

/** GET /_api/serverlogics/sites. Mirrors the wireframe's SITES[]. */
export interface SiteDto {
  code: string
  name: string
  address: string
  city: string
  contact: string
  phone: string
  email: string
  isDefault: boolean
}

/** Dashboard banner (Dataverse chp_announcement, newest active row). Mirrors the wireframe's ANNOUNCEMENT. */
export interface AnnouncementDto {
  title: string
  message: string
}
export type OrderStatus = 'Open' | 'Pending Prepayment' | 'Ready for Dispatch' | 'Completely Shipped' | 'Invoiced'

/** One row of GET /_api/serverlogics/orders. Mirrors the wireframe's ORDERS[]; null = BC has no value yet. */
export interface OrderSummaryDto {
  so: string
  date: string
  po: string
  site: string
  ship: 'Pickup' | 'Delivery' | null
  bso: string | null
  trip: { id: string; assignedAt: string | null } | null
  edd: string | null
  total: number
  status: OrderStatus | null
}

export interface OrderLineDto {
  code: string
  description: string
  qty: number
  uom: string
  unitPrice: number
  /** BC's line amount; never computed in the SPA. */
  lineTotal: number
}

/** GET /_api/serverlogics/orders?id=… */
export interface OrderDto extends OrderSummaryDto {
  lines: OrderLineDto[]
}

/** Which BC document an order read is about: a Sales Order or a Blanket Sales Order (S3-16, `?type=blanket`). */
export type OrderKind = 'order' | 'blanket'

/** GET /_api/serverlogics/orders?type=blanket: the customer's Blanket Sales Orders, newest first. */
export interface BlanketOrdersDto {
  orders: OrderSummaryDto[]
}

export interface OrdersPageDto {
  orders: OrderSummaryDto[]
  total: number
  page: number
  pageSize: number
}

/** GET /_api/serverlogics/ledger. Mirrors the wireframe's LEDGER_ENTRIES; amounts are BC's, signed (payments and credits negative). */
export interface LedgerEntryDto {
  docNo: string
  refPo: string | null
  /** 'Invoice' | 'Credit Memo' | 'Payment', or BC's own name for any other type. */
  type: string
  desc: string
  postingDate: string
  dueDate: string | null
  original: number
  remaining: number
  status: 'Open' | 'Closed'
}

export interface LedgerPageDto {
  entries: LedgerEntryDto[]
  total: number
  page: number
  pageSize: number
}

/** GET /_api/serverlogics/dashboard. null = BC sent no count, or its credit overview (S2-09) could not be read. */
export interface DashboardDto {
  counts: { open: number | null; pendingPrepayment: number | null; readyForDispatch: number | null; completelyShipped: number | null; invoiced: number | null }
  account: { balance: number | null; balanceDue: number | null; overdue: number | null; creditLimit: number | null; exposure: number | null; availableCredit: number | null }
}

/** GET /_api/serverlogics/source-plants: BC's Source Plant List. */
export interface SourcePlantDto {
  code: string
  name: string
}

/** New Order options (S3-05 `order-options`). Payment terms are sample until BC confirms them; prices are `order-quote`'s, credit the dashboard's. */
export interface OrderOptionsDto {
  /** From `portal-items` (BC's mcrmPortalItems), merged in by useOrderOptions. uom is the item's sales unit. */
  items: { code: string; description: string; uom: string }[]
  /** From `source-plants` (BC's mcrmSourcePlants), merged in by useOrderOptions. */
  plants: SourcePlantDto[]
  paymentMethod: 'cash' | 'credit'
  paymentTerms: string
  prepaymentTerms: string
}

/** POST /_api/serverlogics/order-quote body: the chosen lines (item, sales unit, qty > 0) and how they're fulfilled. */
export interface OrderQuoteRequest {
  shipmentMethod: 'pickup' | 'delivery'
  source: string
  /** The delivery site's code; "" for pick up. */
  site: string
  lines: { code: string; uom: string; qty: number }[]
}

/** BC's price quote (S3-06), one entry per request line in order; totals are BC's lines summed on the server. */
export interface OrderQuoteDto {
  /** otherCharges = fuel surcharge + port charges. message is BC's note for the customer, "" when none. */
  lines: { unitPrice: number; lineAmount: number; freight: number; otherCharges: number; total: number; message: string }[]
  subtotal: number
  freight: number
  otherCharges: number
  total: number
}

/** orders POST (S3-10, S3-04): the order as the customer chose it; never a price or total (BC prices it again). */
export interface OrderSubmitRequest extends OrderQuoteRequest {
  /** A Blanket Order (S3-16): every line carries the customer's agreed unit price. Absent for a Single Order. */
  orderType?: 'blanket'
  lines: (OrderQuoteRequest['lines'][number] & { price?: number })[]
  paymentMethod: 'cash' | 'credit'
  poRef: string
  pickupDate: string
  requestedDate: string
  receivingPerson: string
  receivingContact: string
  receivingEmail: string
  /** BC Receiving Time code: 24H, DAY, EARLY or NIGHT. */
  timeWindow: string
  instructions: string
}

/**
 * The new BC Sales Order's number (autoApproved: a credit order BC released within credit, S3-04); pending: a credit order
 * held for the credit team; notPriced when BC couldn't price a line on the second look.
 */
export type OrderSubmitDto = { so: string; autoApproved?: true } | { pending: true } | { notPriced: true }

/** One row of GET /_api/serverlogics/orders?view=pending (S3-11): the account's held or declined credit orders. */
export interface PendingOrderDto {
  id: string
  submitted: string
  po: string
  site: string
  est: number
  status: 'Awaiting credit approval' | 'Approved — being processed' | 'Declined'
  reason: string
  comment: string
}

/** chp_payload of a draft (S3-12): the New Order form's choices. No prices, freight or credit; they're current on Continue. */
export interface DraftPayload {
  version: 1
  orderType: 'single' | 'blanket'
  form: NewOrderForm
}

/** One row of GET /_api/serverlogics/drafts. Only the signed-in contact's own drafts. */
export interface DraftDto {
  id: string
  label: string
  savedAt: string
  payload: DraftPayload
}

export type ServiceStatus = 'Submitted' | 'In Review' | 'Resolved'
export type ContactMethod = 'Email' | 'Mobile'
export interface AttachmentDto { name: string; base64: string }
export interface RequestDto { id: string; ref: string; submitted: string; category: string; requestType: string; assignedGroup: string; contactMethod: ContactMethod; contactValue: string; contactPerson: string; details: string; additionalInfo: string; attachmentName: string; extra: { label: string; value: string }[]; status: ServiceStatus }
export interface ComplaintDto { id: string; ref: string; submitted: string; category: string; complaintType: string; assignedGroup: string; incidentDate: string; deliverySite: string; subject: string; description: string; relatedOrder: string; contactMethod: ContactMethod; contactValue: string; contactPerson: string; attachmentName: string; status: ServiceStatus; dateResolved: string; resolutionNote: string }
export interface RequestFieldConfig { rows: string[]; orderLabel?: string; optional?: string[] }
export interface RequestTaxonomyDto { categories: { name: string; fields: RequestFieldConfig; types: { type: string; group: string }[] }[] }
export interface ComplaintTaxonomyDto { categories: { name: string; types: { type: string; group: string }[] }[] }
export interface RequestSubmitDto { category: string; requestType: string; contactMethod: ContactMethod; contactValue: string; details: string; additionalInfo: string; fields: Record<string, string>; attachmentName?: string }
export interface ComplaintSubmitDto { category: string; complaintType: string; contactMethod: ContactMethod; contactValue: string; incidentDate: string; site: string; relatedOrder: string; subject: string; description: string; consent: boolean; attachmentName?: string }
/** The saved row; a file named in attachmentName follows through the Web API, then PUT {id} releases the row. */
export type SubmitResultDto = { ref: string; id: string } | { invalid: true; field: string }
export type AttachResultDto = { ref: string; attached: boolean } | { invalid: true; field: string }

export type DocumentType = 'Invoice' | 'Credit Memo' | 'Acknowledgement Receipt' | 'Delivery Receipt'

export interface DocumentDto {
  /** A DocumentType, or BC's own name for anything else. */
  type: string
  /** Document no. */
  ref: string
  soNo: string | null
  poRef: string | null
  /** YYYY-MM-DD (posting date) */
  date: string
  /** null for Delivery Receipt */
  amount: number | null
}

export interface DocumentPageDto {
  documents: DocumentDto[]
  total: number
  page: number
  pageSize: number
}

export interface DocumentFileDto {
  fileName: string
  contentType: string
  base64: string
}
