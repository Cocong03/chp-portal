import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { BlanketOrdersDto, OrderDto, OrderKind, OrdersPageDto, PendingOrderDto } from '@/api/types'

export interface OrderFilters {
  q: string
  status: string
  site: string
  from: string
  to: string
  page: number
}

/** The endpoint's query string: empty filters and page 1 are left out. */
export function ordersQuery(filters: OrderFilters): Record<string, string> {
  const query: Record<string, string> = {}
  for (const key of ['q', 'status', 'site', 'from', 'to'] as const) if (filters[key]) query[key] = filters[key]
  if (filters.page > 1) query.page = String(filters.page)
  return query
}

/** A page of the customer's orders, filtered and paged in BC. The previous page stays on screen while the next loads. */
export function useOrders(filters: OrderFilters) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => serverLogic<OrdersPageDto>('orders', { query: ordersQuery(filters) }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

/** The customer's Blanket Sales Orders (S3-16): one list, no filters or pages. */
export function useBlanketOrders() {
  return useQuery({
    queryKey: ['blanket-orders'],
    queryFn: () => serverLogic<BlanketOrdersDto>('orders', { query: { type: 'blanket' } }),
    staleTime: 60_000,
  })
}

/** The account's credit orders held for the credit team or declined (S3-11). */
export function usePendingOrders() {
  return useQuery({
    queryKey: ['orders', 'pending'],
    queryFn: () => serverLogic<PendingOrderDto[]>('orders', { query: { view: 'pending' } }),
    staleTime: 60_000,
  })
}

/** One order (or Blanket Sales Order) with its lines, fetched fresh each time the dialog opens. `null` = not found (missing or another customer's). */
export function useOrder(id: string | null, kind: OrderKind = 'order') {
  return useQuery({
    queryKey: kind === 'blanket' ? ['order', 'blanket', id] : ['order', id],
    queryFn: async (): Promise<OrderDto | null> => {
      const query: Record<string, string> = kind === 'blanket' ? { type: 'blanket', id: id! } : { id: id! }
      const answer = await serverLogic<OrderDto | { notFound: true }>('orders', { query })
      return 'notFound' in answer ? null : answer
    },
    enabled: !!id,
    staleTime: 0,
  })
}
