import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { LedgerPageDto } from '@/api/types'

export interface LedgerFilters {
  q: string
  type: string
  /** 'all' for All entries; '' = Open items only (the default). */
  show: string
  from: string
  to: string
  page: number
}

/** The endpoint's query string: empty filters and page 1 are left out. */
export function ledgerQuery(filters: LedgerFilters): Record<string, string> {
  const query: Record<string, string> = {}
  for (const key of ['q', 'type', 'show', 'from', 'to'] as const) if (filters[key]) query[key] = filters[key]
  if (filters.page > 1) query.page = String(filters.page)
  return query
}

/** A page of the customer's ledger entries, filtered and paged in BC. The previous page stays on screen while the next loads. */
export function useLedger(filters: LedgerFilters) {
  return useQuery({
    queryKey: ['ledger', filters],
    queryFn: () => serverLogic<LedgerPageDto>('ledger', { query: ledgerQuery(filters) }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}
