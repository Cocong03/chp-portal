import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { SiteDto } from '@/api/types'

/** The account's BC ship-to addresses. Cached for minutes (Architecture §6). */
export function useSites() {
  return useQuery({ queryKey: ['sites'], queryFn: () => serverLogic<SiteDto[]>('sites'), staleTime: 5 * 60_000 })
}
