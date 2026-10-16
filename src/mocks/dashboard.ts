import type { DashboardDto, OrderStatus } from '@/api/types'
import { MOCK_ORDERS } from './orders'

const count = (status: OrderStatus) => MOCK_ORDERS.filter((order) => order.status === status).length

/** Wireframe LEDGER and CREDIT figures. The deployed Dashboard shows them too until BC has balances (S2-07) and available credit (S2-09). */
export const SAMPLE_ACCOUNT: DashboardDto['account'] = { balance: 468250, balanceDue: 210000, overdue: 42500, creditLimit: 750000, availableCredit: 414250 }

/** Counts from the local sample orders so the tiles match the local Orders list. */
export function dashboardMock(): DashboardDto {
  return {
    counts: {
      open: count('Open'),
      pendingPrepayment: count('Pending Prepayment'),
      readyForDispatch: count('Ready for Dispatch'),
      completelyShipped: count('Completely Shipped'),
      invoiced: count('Invoiced'),
    },
    account: SAMPLE_ACCOUNT,
  }
}
