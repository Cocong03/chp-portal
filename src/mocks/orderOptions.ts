import type { OrderOptionsDto, OrderQuoteDto, OrderQuoteRequest, SourcePlantDto } from '@/api/types'
import type { MockRequest } from './index'
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
 * The deployed site serves it too (SAMPLE_ONLY) until BC confirms payment method and terms.
 */
export const ORDER_OPTIONS_SAMPLE: OrderOptionsDto = {
  items: Object.entries(CATALOG).map(([code, item]) => ({ code, description: item.desc, uom: item.uom })),
  plants: SOURCE_PLANTS_SAMPLE,
  paymentMethod: 'cash',
  paymentTerms: '30 Days from Invoice Date',
  prepaymentTerms: '100% advance payment before dispatch',
}

/** Local dev order-quote: the catalog price; delivery adds ₱10 freight and ₱5 fuel surcharge per unit, like BC Dev on 2026-10-23. */
export function orderQuoteMock({ body }: MockRequest): OrderQuoteDto {
  const request = body as OrderQuoteRequest
  const delivery = request.shipmentMethod === 'delivery'
  const lines = request.lines.map(({ code, qty }) => {
    const unitPrice = CATALOG[code]?.price ?? 0
    const freight = delivery ? 10 * qty : 0
    const otherCharges = delivery ? 5 * qty : 0
    return { unitPrice, lineAmount: unitPrice * qty, freight, otherCharges, total: unitPrice * qty + freight + otherCharges, message: '' }
  })
  const sum = (key: 'lineAmount' | 'freight' | 'otherCharges' | 'total') => lines.reduce((total, line) => total + line[key], 0)
  return { lines, subtotal: sum('lineAmount'), freight: sum('freight'), otherCharges: sum('otherCharges'), total: sum('total') }
}
