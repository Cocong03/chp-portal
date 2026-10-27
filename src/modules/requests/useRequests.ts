import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { RequestDto, RequestTaxonomyDto } from '@/api/types'

export function useRequests() {
  return useQuery({ queryKey: ['requests'], queryFn: () => serverLogic<RequestDto[]>('requests') })
}

/** Categories, types and groups change rarely, so cache them for minutes. */
export function useRequestTaxonomy() {
  return useQuery({
    queryKey: ['requests', 'taxonomy'],
    queryFn: () => serverLogic<RequestTaxonomyDto>('requests', { query: { taxonomy: '1' } }),
    staleTime: 5 * 60_000,
  })
}
