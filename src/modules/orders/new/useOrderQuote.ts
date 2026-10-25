import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useWatch, type Control } from 'react-hook-form'
import { serverLogic } from '@/api/serverLogic'
import type { OrderOptionsDto, OrderQuoteDto, OrderQuoteRequest } from '@/api/types'
import { quoteRequest, type NewOrderForm } from './form'

/** BC's price quote for a request (as JSON), cached by it: New Order and the Drafts tab share answers. Carries its request. */
export const quoteQuery = (request: string) => ({
  queryKey: ['order-quote', request],
  queryFn: async () => {
    const body = JSON.parse(request) as OrderQuoteRequest
    return { ...(await serverLogic<OrderQuoteDto>('order-quote', { method: 'POST', body })), request: body }
  },
  staleTime: 60_000,
})

type PricedQuote = OrderQuoteDto & { request: OrderQuoteRequest }

/**
 * This line's price from an earlier quote, when that quote had the same source, shipment method and site and a line
 * with the same item, unit and qty: BC prices it the same, so it can stay on screen while the new quote runs.
 */
function unchangedLine(previous: PricedQuote | undefined, request: OrderQuoteRequest | null, position: number) {
  const line = request?.lines[position]
  if (!previous || !request || !line) return undefined
  const { shipmentMethod, source, site, lines } = previous.request
  if (shipmentMethod !== request.shipmentMethod || source !== request.source || site !== request.site) return undefined
  const match = lines.findIndex((each) => each.code === line.code && each.uom === line.uom && each.qty === line.qty)
  return match < 0 ? undefined : previous.lines[match]
}

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
 * changes, once the form has been still for 400 ms. While a newer quote is on its way the totals wait, and so does every
 * line except those whose price can't have changed (see unchangedLine).
 */
export function useOrderQuote(control: Control<NewOrderForm>, items: OrderOptionsDto['items']) {
  const [lines, shipmentMethod, source, site] = useWatch({ control, name: ['lines', 'shipmentMethod', 'source', 'site'] })
  const { request, indexes } = quoteRequest({ lines, shipmentMethod, source, site }, items)
  const key = request && JSON.stringify(request)
  const settled = useSettled(key, 400)
  const query = useQuery({ ...quoteQuery(settled ?? ''), enabled: key !== null && settled === key, placeholderData: keepPreviousData })
  const status: QuoteStatus =
    !key ? 'none' : settled !== key || query.isPending || query.isPlaceholderData ? 'pending' : query.isError ? 'error' : 'ready'
  const data = status === 'ready' ? query.data : undefined
  const previous = status === 'pending' ? query.data : undefined
  return {
    status,
    /** Lines with an item and a qty > 0. */
    count: indexes.length,
    quote: data,
    /** Whether form line `index` has an item and a qty > 0. */
    chosen: (index: number) => indexes.includes(index),
    /** The quote for form line `index`, when it's a chosen line and the quote is in (or its price can't have changed). */
    line: (index: number) => {
      const position = indexes.indexOf(index)
      return data ? data.lines[position] : unchangedLine(previous, request, position)
    },
    retry: () => void query.refetch(),
  }
}

export type OrderQuote = ReturnType<typeof useOrderQuote>
