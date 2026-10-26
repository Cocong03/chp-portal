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

/** orders POST (S3-10): the order as the customer chose it; never a price or total (BC prices it again). Cash only until Phase 2. */
export interface OrderSubmitRequest extends OrderQuoteRequest {
  paymentMethod: 'cash'
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

/** The new BC Sales Order's number, or notPriced when BC couldn't price a line on the second look. */
export type OrderSubmitDto = { so: string } | { notPriced: true }

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
