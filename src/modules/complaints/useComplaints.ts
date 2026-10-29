import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { ComplaintDto, ComplaintTaxonomyDto } from '@/api/types'

export function useComplaints() {
  // monday's webhook updates Dataverse within seconds; re-checking while the page is open shows it without a reload.
  return useQuery({ queryKey: ['complaints'], queryFn: () => serverLogic<ComplaintDto[]>('complaints'), refetchInterval: 30_000 })
}

/** Categories, types and groups change rarely, so cache them for minutes. */
export function useComplaintTaxonomy() {
  return useQuery({
    queryKey: ['complaints', 'taxonomy'],
    queryFn: () => serverLogic<ComplaintTaxonomyDto>('complaints', { query: { taxonomy: '1' } }),
    staleTime: 5 * 60_000,
  })
}
