import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { MeDto } from '@/api/types'

/** The signed-in contact, active account and web roles, from the `me` Server Logic. */
export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => serverLogic<MeDto>('me'), staleTime: 5 * 60_000 })
}
