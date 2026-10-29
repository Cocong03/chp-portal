import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { OrdersPageDto } from '@/api/types'

// shortcut: loads every order number (orders?all=true) when a dialog opens; switch to a searchable picker if customers have thousands of orders.
/** Every sales order number on the account, for the request forms' order pickers. */
export function useOrderNumbers() {
  return useQuery({
    queryKey: ['orders', 'numbers'],
    queryFn: () => serverLogic<OrdersPageDto>('orders', { query: { all: 'true' } }),
    select: (page) => page.orders.map((order) => order.so),
    staleTime: 60_000,
  })
}
