import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { OrderDto, OrdersPageDto } from '@/api/types'

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

/** One order with its lines, fetched fresh each time the dialog opens. `null` = not found (missing or another customer's). */
export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: async (): Promise<OrderDto | null> => {
      const answer = await serverLogic<OrderDto | { notFound: true }>('orders', { query: { id: id! } })
      return 'notFound' in answer ? null : answer
    },
    enabled: !!id,
    staleTime: 0,
  })
}
