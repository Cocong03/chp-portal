import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { DashboardDto } from '@/api/types'

/** Dashboard figures, read live from BC; staleTime 0 refetches them on every Dashboard visit (as the announcement). */
export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => serverLogic<DashboardDto>('dashboard'), staleTime: 0 })
}
