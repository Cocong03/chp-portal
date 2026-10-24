import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWatch, type Control } from 'react-hook-form'
import { serverLogic } from '@/api/serverLogic'
import type { OrderOptionsDto, OrderQuoteDto } from '@/api/types'
import { quoteRequest, type NewOrderForm } from './form'

/** BC's price quote for a request (as JSON), cached by it: New Order and the Drafts tab share answers. */
export const quoteQuery = (request: string) => ({
  queryKey: ['order-quote', request],
  queryFn: () => serverLogic<OrderQuoteDto>('order-quote', { method: 'POST', body: JSON.parse(request) }),
  staleTime: 60_000,
})

/** The value once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return settled
}

export type QuoteStatus = 'none' | 'pending' | 'error' | 'ready'

/**
 * New Order prices (S3-06): BC re-quotes the order whenever an item, qty, source, shipment method or delivery site
 * changes, once the form has been still for 400 ms. While a newer quote is on its way the old prices are never shown.
 */
export function useOrderQuote(control: Control<NewOrderForm>, items: OrderOptionsDto['items']) {
  const [lines, shipmentMethod, source, site] = useWatch({ control, name: ['lines', 'shipmentMethod', 'source', 'site'] })
  const { request, indexes } = quoteRequest({ lines, shipmentMethod, source, site }, items)
  const key = request && JSON.stringify(request)
  const settled = useSettled(key, 400)
  const query = useQuery({ ...quoteQuery(settled ?? ''), enabled: key !== null && settled === key })
  const status: QuoteStatus = !key ? 'none' : settled !== key || query.isPending ? 'pending' : query.isError ? 'error' : 'ready'
  const data = status === 'ready' ? query.data : undefined
  return {
    status,
    /** Lines with an item and a qty > 0. */
    count: indexes.length,
    quote: data,
    /** Whether form line `index` has an item and a qty > 0. */
    chosen: (index: number) => indexes.includes(index),
    /** The quote for form line `index`, when it's a chosen line and the quote is in. */
    line: (index: number) => data?.lines[indexes.indexOf(index)],
    retry: () => void query.refetch(),
  }
}

export type OrderQuote = ReturnType<typeof useOrderQuote>
