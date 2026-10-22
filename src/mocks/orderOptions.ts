import type { OrderOptionsDto } from '@/api/types'
import { CATALOG } from './orders'

/**
 * Wireframe CATALOG, plants and CUSTOMER terms.
 * The deployed site serves it too (SAMPLE_ONLY) until BC delivers items/prices (S3-01) and freight (S3-02).
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
  freight: { delivery: 3500, pickup: 0 },
  otherCharges: 0,
}
