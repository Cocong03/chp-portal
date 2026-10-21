import type { OrderDto, OrdersPageDto, OrderStatus } from '@/api/types'
import type { MockRequest } from './index'

// Wireframe CATALOG and ORDERS (Mockup-chp-v2.html). Totals here are mock data only; the real ones come from BC.
export const CATALOG: Record<string, { desc: string; uom: string; price: number }> = {
  'CEM-T1-40KG': { desc: 'Portland Cement Type I — 40kg Bag', uom: 'BAG', price: 245 },
  'CEM-T2-BULK': { desc: 'Portland Cement Type II — Bulk', uom: 'MT', price: 4850 },
  'CEM-T1-BULK': { desc: 'Portland Cement Type I — Bulk', uom: 'MT', price: 4700 },
  'AGG-SAND-CU': { desc: 'Washed Sand — Aggregate', uom: 'CU.M', price: 1150 },
}

type Raw = [so: string, date: string, edd: string, po: string, site: string, status: OrderStatus, ship: 'Pickup' | 'Delivery',
  trip: [id: string, assignedAt: string] | null, bso: string | null, lines: [code: string, qty: number][]]

const RAW: Raw[] = [
  ['SO-100482', '2026-09-02', '2026-09-09', 'PO-8841', 'PLANT3', 'Invoiced', 'Delivery', ['TRIP-40522', '2026-09-01'], null, [['CEM-T1-40KG', 600], ['CEM-T1-BULK', 8]]],
  ['SO-100467', '2026-08-28', '2026-09-04', 'PO-8790', 'PLANT1', 'Open', 'Pickup', null, null, [['CEM-T1-40KG', 350], ['AGG-SAND-CU', 6]]],
  ['SO-100455', '2026-08-20', '2026-08-27', 'PO-8765', 'PLANT3', 'Ready for Dispatch', 'Pickup', ['TRIP-30188', '2026-08-19'], null, [['CEM-T2-BULK', 40], ['CEM-T1-BULK', 24]]],
  ['SO-100441', '2026-08-14', '2026-08-21', 'PO-8730', 'PLANT2', 'Pending Prepayment', 'Delivery', null, null, [['CEM-T1-40KG', 200], ['AGG-SAND-CU', 8]]],
  ['SO-100430', '2026-08-05', '2026-08-12', 'PO-8695', 'PLANT1', 'Completely Shipped', 'Pickup', ['TRIP-30142', '2026-08-04'], 'BSO-20441', [['CEM-T1-BULK', 25], ['AGG-SAND-CU', 9]]],
  ['SO-100418', '2026-07-29', '2026-08-05', 'PO-8660', 'PLANT2', 'Completely Shipped', 'Delivery', ['TRIP-40488', '2026-07-28'], null, [['CEM-T1-40KG', 400], ['AGG-SAND-CU', 10]]],
  ['SO-100405', '2026-07-22', '2026-07-29', 'PO-8622', 'PLANT3', 'Invoiced', 'Pickup', ['TRIP-30095', '2026-07-21'], 'BSO-20441', [['CEM-T2-BULK', 15], ['CEM-T1-BULK', 10]]],
  ['SO-100392', '2026-07-15', '2026-07-22', 'PO-8590', 'PLANT1', 'Invoiced', 'Delivery', ['TRIP-40455', '2026-07-14'], null, [['CEM-T1-40KG', 250]]],
  ['SO-100380', '2026-07-08', '2026-07-15', 'PO-8551', 'PLANT2', 'Completely Shipped', 'Pickup', ['TRIP-30061', '2026-07-07'], null, [['AGG-SAND-CU', 20], ['CEM-T1-40KG', 100]]],
  ['SO-100371', '2026-07-01', '2026-07-08', 'PO-8517', 'PLANT3', 'Invoiced', 'Delivery', ['TRIP-40417', '2026-06-30'], null, [['CEM-T1-BULK', 18]]],
  ['SO-100360', '2026-06-24', '2026-07-01', 'PO-8480', 'PLANT1', 'Completely Shipped', 'Pickup', ['TRIP-30028', '2026-06-23'], null, [['CEM-T1-40KG', 600]]],
  ['SO-100349', '2026-06-17', '2026-06-24', 'PO-8443', 'PLANT2', 'Invoiced', 'Delivery', ['TRIP-40390', '2026-06-16'], null, [['CEM-T2-BULK', 25], ['AGG-SAND-CU', 5]]],
  ['SO-100338', '2026-06-10', '2026-06-17', 'PO-8409', 'PLANT3', 'Invoiced', 'Pickup', ['TRIP-29988', '2026-06-09'], null, [['CEM-T1-BULK', 30]]],
  ['SO-100327', '2026-06-03', '2026-06-10', 'PO-8371', 'PLANT1', 'Invoiced', 'Delivery', ['TRIP-40358', '2026-06-02'], null, [['CEM-T1-40KG', 450], ['CEM-T1-BULK', 6]]],
]

export const MOCK_ORDERS: OrderDto[] = RAW.map(([so, date, edd, po, site, status, ship, trip, bso, lines]) => {
  const orderLines = lines.map(([code, qty]) => {
    const item = CATALOG[code]
    return { code, description: item.desc, qty, uom: item.uom, unitPrice: item.price, lineTotal: item.price * qty }
  })
  return {
    so, date, po, site, ship, bso, edd, status,
    trip: trip && { id: trip[0], assignedAt: trip[1] },
    total: orderLines.reduce((sum, line) => sum + line.lineTotal, 0),
    lines: orderLines,
  }
})

/** Dev-server stand-in for the orders Server Logic (same query parameters, same answers). */
export function ordersMock({ query = {} }: MockRequest): OrdersPageDto | OrderDto | { notFound: true } {
  if (query.id) return MOCK_ORDERS.find((o) => o.so === query.id) ?? { notFound: true }
  const q = (query.q ?? '').trim().toLowerCase()
  const rows = MOCK_ORDERS.filter(
    (o) =>
      (!q || o.so.toLowerCase().includes(q) || o.po.toLowerCase().includes(q)) &&
      (!query.status || o.status === query.status) &&
      (!query.site || o.site === query.site) &&
      (!query.from || o.date >= query.from) &&
      (!query.to || o.date <= query.to),
  )
  const toSummary = ({ lines: _lines, ...summary }: OrderDto) => summary
  // all=true (Export to Excel): every match in one answer.
  if (query.all === 'true') return { orders: rows.map(toSummary), total: rows.length, page: 1, pageSize: rows.length }
  const page = Math.max(1, Number(query.page) || 1)
  return { orders: rows.slice((page - 1) * 10, page * 10).map(toSummary), total: rows.length, page, pageSize: 10 }
}
