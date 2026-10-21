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

/** GET /_api/serverlogics/dashboard. null = BC doesn't provide it yet (balances: S2-07; available credit: S2-09) or sent no count. */
export interface DashboardDto {
  counts: { open: number | null; pendingPrepayment: number | null; readyForDispatch: number | null; completelyShipped: number | null; invoiced: number | null }
  account: { balance: number | null; balanceDue: number | null; overdue: number | null; creditLimit: number | null; availableCredit: number | null }
}

/** New Order options (S3-05 `order-options`). Sample until BC delivers items/prices (S3-01), credit (S2-09) and freight (S3-02). */
export interface OrderOptionsDto {
  items: { code: string; description: string; uom: string; unitPrice: number }[]
  plants: { code: string; label: string }[]
  paymentMethod: 'cash' | 'terms'
  paymentTerms: string
  prepaymentTerms: string
  credit: { limit: number; exposure: number; available: number }
  freight: { delivery: number; pickup: number }
  otherCharges: number
}
