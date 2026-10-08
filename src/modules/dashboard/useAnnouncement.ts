import { useQuery } from '@tanstack/react-query'
import type { AnnouncementDto } from '@/api/types'
import { webApiGet } from '@/api/webApi'

interface AnnouncementRow {
  chp_title: string | null
  chp_message: string | null
}

/** The newest active announcement, or null. Ops changes show within 5 minutes. */
export function useAnnouncement() {
  return useQuery({
    queryKey: ['announcement'],
    queryFn: async (): Promise<AnnouncementDto | null> => {
      const [row] = await webApiGet<AnnouncementRow>(
        'chp_announcements',
        '$select=chp_title,chp_message&$filter=chp_active eq true&$orderby=modifiedon desc&$top=1',
      )
      return row?.chp_title ? { title: row.chp_title, message: row.chp_message ?? '' } : null
    },
    staleTime: 5 * 60_000,
  })
}
