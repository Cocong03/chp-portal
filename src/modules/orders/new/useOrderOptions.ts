import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { OrderOptionsDto, SourcePlantDto } from '@/api/types'

/**
 * Items, plants and payment terms for New Order (S3-05). Items and plants are BC's (`portal-items`,
 * `source-plants`); terms are answered by the sample until BC confirms them. Prices are `order-quote`'s. ponytail: three calls in one query;
 * fold them into order-options when it goes live.
 */
export function useOrderOptions() {
  return useQuery({
    queryKey: ['order-options'],
    queryFn: async (): Promise<OrderOptionsDto> => {
      const [options, items, plants] = await Promise.all([
        serverLogic<OrderOptionsDto>('order-options'),
        serverLogic<OrderOptionsDto['items']>('portal-items'),
        serverLogic<SourcePlantDto[]>('source-plants'),
      ])
      return { ...options, items, plants }
    },
    staleTime: 5 * 60_000,
  })
}
