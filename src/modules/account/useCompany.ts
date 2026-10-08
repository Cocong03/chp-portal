import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { CompanyDto } from '@/api/types'

/** The account's BC customer card and contacts with portal access. */
export function useCompany() {
  return useQuery({ queryKey: ['company'], queryFn: () => serverLogic<CompanyDto>('company'), staleTime: 5 * 60_000 })
}
