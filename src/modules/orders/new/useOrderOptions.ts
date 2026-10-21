import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { OrderOptionsDto } from '@/api/types'

/** Items, plants, payment terms, credit and freight for New Order (S3-05). Answered by the sample until BC delivers. */
export function useOrderOptions() {
  return useQuery({ queryKey: ['order-options'], queryFn: () => serverLogic<OrderOptionsDto>('order-options'), staleTime: 5 * 60_000 })
}
