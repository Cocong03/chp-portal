import type { OrderOptionsDto } from '@/api/types'
import { SAMPLE_ACCOUNT } from './dashboard'
import { CATALOG } from './orders'

const limit = SAMPLE_ACCOUNT.creditLimit ?? 0
const available = SAMPLE_ACCOUNT.availableCredit ?? 0

/**
 * Wireframe CATALOG, plants and CUSTOMER terms; credit from the Dashboard's sample figures so both screens agree.
 * The deployed site serves it too (SAMPLE_ONLY) until BC delivers items/prices (S3-01), credit (S2-09) and freight (S3-02).
 */
export const ORDER_OPTIONS_SAMPLE: OrderOptionsDto = {
  items: Object.entries(CATALOG).map(([code, item]) => ({ code, description: item.desc, uom: item.uom, unitPrice: item.price })),
  plants: [
    { code: 'PLANT1', label: 'Plant 1 — Main Yard' },
    { code: 'PLANT2', label: 'Plant 2 — North Depot' },
    { code: 'PLANT3', label: 'Plant 3 — Warehouse A' },
  ],
  paymentMethod: 'cash',
  paymentTerms: '30 Days from Invoice Date',
  prepaymentTerms: '100% advance payment before dispatch',
  credit: { limit, exposure: limit - available, available },
  freight: { delivery: 3500, pickup: 0 },
  otherCharges: 0,
}
