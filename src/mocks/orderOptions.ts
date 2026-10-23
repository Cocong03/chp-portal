import type { OrderOptionsDto, SourcePlantDto } from '@/api/types'
import { CATALOG } from './orders'

/**
 * Wireframe plants, for local dev; the deployed site reads BC's (source-plants is live).
 */
export const SOURCE_PLANTS_SAMPLE: SourcePlantDto[] = [
  { code: 'PLANT1', name: 'Plant 1 — Main Yard' },
  { code: 'PLANT2', name: 'Plant 2 — North Depot' },
  { code: 'PLANT3', name: 'Plant 3 — Warehouse A' },
]

/**
 * Wireframe CATALOG and CUSTOMER terms (with the sample plants, as useOrderOptions combines them).
 * The deployed site serves it too (SAMPLE_ONLY) until BC delivers items/prices (S3-01) and freight (S3-02).
 */
export const ORDER_OPTIONS_SAMPLE: OrderOptionsDto = {
  items: Object.entries(CATALOG).map(([code, item]) => ({ code, description: item.desc, uom: item.uom, unitPrice: item.price })),
  plants: SOURCE_PLANTS_SAMPLE,
  paymentMethod: 'cash',
  paymentTerms: '30 Days from Invoice Date',
  prepaymentTerms: '100% advance payment before dispatch',
  freight: { delivery: 3500, pickup: 0 },
  otherCharges: 0,
}
