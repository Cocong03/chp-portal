import type { AnnouncementDto, CompanyDto, MeDto, SiteDto } from '@/api/types'
import { getPortalUser } from '@/auth/session'
import { dashboardMock } from './dashboard'
import { draftsMock } from './drafts'
import { ledgerMock } from './ledger'
import { ORDER_OPTIONS_SAMPLE, orderQuoteMock, SOURCE_PLANTS_SAMPLE } from './orderOptions'
import { ordersMock } from './orders'
import { complaintsMock, requestsMock } from './service'

export interface MockRequest {
  method: string
  query?: Record<string, string>
  body?: unknown
}

// Sign in on the dev server with one of these emails to see that role's portal. Unknown emails get Full Access.
const ROLES_BY_EMAIL = new Map<string, string[]>([
  ['full@test.ph', ['Full Access']],
  ['orders@test.ph', ['Orders & Delivery']],
  ['finance@test.ph', ['Finance & Documents']],
  ['viewonly@test.ph', ['View Only']],
  ['norole@test.ph', []],
  ['nolink@test.ph', ['Full Access']],
  ['blocked@test.ph', ['Full Access']],
])

/** Dev-server answers by Server Logic name. Each module adds its own fixture when it's built. */
export const mocks: Record<string, ((request: MockRequest) => unknown) | undefined> = {
  me: (): MeDto => {
    const email = (getPortalUser()?.email ?? 'full@test.ph').trim().toLowerCase()
    if (email === 'blocked@test.ph') return { contact: { name: 'J.D. Santos', email }, account: null, roles: [], blocked: true }
    return {
      contact: { name: 'J.D. Santos', email },
      // Wireframe ACCOUNTS[0]; nolink@ simulates a contact that isn't linked to an account yet.
      account:
        email === 'nolink@test.ph'
          ? null
          : { customerNo: '10482', customerName: 'J.D. Santos Hardware & Construction Supply', company: 'Solid Cement' },
      roles: ['Authenticated Users', ...(ROLES_BY_EMAIL.get(email) ?? ['Full Access'])],
    }
  },
  // Wireframe ACCOUNTS[0] + PORTAL_CONTACTS
  company: (): CompanyDto => ({
    customerNo: '10482',
    customerName: 'J.D. Santos Hardware & Construction Supply',
    address: 'Blk 12 Lot 4, National Highway, Brgy. San Isidro, Cabuyao, Laguna',
    website: 'www.jdsantoshardware.ph',
    vatRegNumber: '123-456-789-000',
    phone: '0917 552 6613',
    email: 'jd.santos@sample-customer.ph',
    contacts: [
      { name: 'J.D. Santos', title: 'Owner', phone: '0917 552 6613', email: 'jd.santos@sample-customer.ph', portalAccess: true, portalRole: 'Full Access', isYou: true },
      { name: 'Elena Ramos', title: 'Purchasing Manager', phone: '0917 552 6614', email: 'elena.ramos@sample-customer.ph', portalAccess: true, portalRole: 'Orders & Delivery', isYou: false },
      { name: 'Miguel Torres', title: 'Accounting Staff', phone: '0917 552 6615', email: 'miguel.torres@sample-customer.ph', portalAccess: true, portalRole: 'Finance & Documents', isYou: false },
      { name: 'Grace Villanueva', title: 'Site Engineer', phone: '0917 552 6616', email: 'grace.villanueva@sample-customer.ph', portalAccess: false, portalRole: '', isYou: false },
    ],
  }),
  // Wireframe ANNOUNCEMENT
  announcement: (): AnnouncementDto => ({
    title: 'Holiday order cutoff schedule',
    message: 'Submit orders before 3:00 PM to lock in next-business-day confirmation over the upcoming holiday period.',
  }),
  dashboard: dashboardMock,
  drafts: draftsMock,
  ledger: ledgerMock,
  orders: ordersMock,
  requests: requestsMock,
  complaints: complaintsMock,
  'order-options': () => ORDER_OPTIONS_SAMPLE,
  'source-plants': () => SOURCE_PLANTS_SAMPLE,
  'portal-items': () => ORDER_OPTIONS_SAMPLE.items,
  'order-quote': orderQuoteMock,
  // Wireframe SITES
  sites: (): SiteDto[] => [
    { code: 'PLANT1', name: 'Plant 1 — Main Yard', address: 'Km 19 Marcos Highway, Brgy. San Roque', city: 'Antipolo City, Rizal', contact: 'Ramon Cruz', phone: '(02) 8531-4420', email: 'ramon.cruz@sample-customer.ph', isDefault: true },
    { code: 'PLANT2', name: 'Plant 2 — North Depot', address: 'National Highway, Brgy. Sta. Cruz', city: 'Angat, Bulacan', contact: 'Ligaya Fernandez', phone: '(044) 815-2207', email: '', isDefault: false },
    { code: 'PLANT3', name: 'Plant 3 — Warehouse A', address: 'Governor’s Drive, Brgy. Zone IV', city: 'Dasmariñas, Cavite', contact: 'Noel Bautista', phone: '(046) 402-7788', email: '', isDefault: false },
  ],
}
