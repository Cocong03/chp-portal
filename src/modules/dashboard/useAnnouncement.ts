import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { AnnouncementDto } from '@/api/types'

/**
 * The newest active announcement, or null. The `announcement` Server Logic reads it live, and staleTime 0 refetches
 * it on every Dashboard visit, so ops edits in Concreat Connect Admin show on the next page load.
 */
export function useAnnouncement() {
  return useQuery({ queryKey: ['announcement'], queryFn: () => serverLogic<AnnouncementDto | null>('announcement'), staleTime: 0 })
}
