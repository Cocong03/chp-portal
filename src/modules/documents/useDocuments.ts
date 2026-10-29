import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { DocumentPageDto, DocumentType } from '@/api/types'

export const DOCUMENT_TYPES: DocumentType[] = ['Invoice', 'Credit Memo', 'Acknowledgement Receipt', 'Delivery Receipt']

export interface DocumentFilters {
  q: string
  type: string
  from: string
  to: string
  page: number
}

/** The endpoint's query string: empty filters and page 1 are left out. */
export function documentsQuery(filters: DocumentFilters): Record<string, string> {
  const query: Record<string, string> = {}
  for (const key of ['q', 'type', 'from', 'to'] as const) if (filters[key]) query[key] = filters[key]
  if (filters.page > 1) query.page = String(filters.page)
  return query
}

/** A page of the customer's posted documents, filtered and paged in BC. The previous page stays on screen while the next loads. */
export function useDocuments(filters: DocumentFilters) {
  return useQuery({
    queryKey: ['documents', filters],
    queryFn: () => serverLogic<DocumentPageDto>('documents', { query: documentsQuery(filters) }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}
