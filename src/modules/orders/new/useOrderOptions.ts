import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { OrderOptionsDto, SourcePlantDto } from '@/api/types'

/**
 * Items, plants, payment terms and freight for New Order (S3-05). Plants are BC's (`source-plants`); the rest is answered
 * by the sample until BC delivers. ponytail: two calls in one query; fold plants into order-options when it goes live.
 */
export function useOrderOptions() {
  return useQuery({
    queryKey: ['order-options'],
    queryFn: async (): Promise<OrderOptionsDto> => {
      const [options, plants] = await Promise.all([serverLogic<OrderOptionsDto>('order-options'), serverLogic<SourcePlantDto[]>('source-plants')])
      return { ...options, plants }
    },
    staleTime: 5 * 60_000,
  })
}
