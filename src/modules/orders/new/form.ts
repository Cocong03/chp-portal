import type { OrderOptionsDto, OrderQuoteRequest, SiteDto } from '@/api/types'
import { withAutoLine } from './instructions'

/** Everything the New Order form holds. Nothing is sent anywhere yet (Submit is S3-10, Drafts S3-12). */
export interface NewOrderForm {
  orderType: 'single' | 'blanket'
  lines: { code: string; qty: number }[]
  shipmentMethod: 'pickup' | 'delivery'
  source: string
  pickupDate: string
  receivingPerson: string
  receivingContact: string
  receivingEmail: string
  requestedDate: string
  timeWindow: string
  loadingType: string
  callBefore: boolean
  paymentMethod: 'cash' | 'credit'
  instructions: string
  site: string
  poRef: string
}

// Wireframe option lists. The time windows wait on the BC Receiving Time code decision (S3-03).
export const LOADING_TYPES = ['Loose pile', 'Palletized', 'Jumbo Bag']
export const TIME_WINDOWS = ['7:00 – 9:00 AM', '9:00 AM – 12:00 NN', '1:00 – 3:00 PM', '3:00 – 5:00 PM', 'Other — see instructions below']

/** The customer's default ship-to, else the first; "" with none. */
export function defaultSite(sites: SiteDto[]): string {
  return (sites.find((site) => site.isDefault) ?? sites[0])?.code ?? ''
}

export function newOrderDefaults(options: OrderOptionsDto, sites: SiteDto[]): NewOrderForm {
  return {
    orderType: 'single',
    lines: [{ code: '', qty: 1 }],
    shipmentMethod: 'pickup',
    source: options.plants[0]?.code ?? '',
    pickupDate: '',
    receivingPerson: '',
    receivingContact: '',
    receivingEmail: '',
    requestedDate: '',
    timeWindow: TIME_WINDOWS[0],
    loadingType: LOADING_TYPES[0],
    callBefore: false,
    paymentMethod: options.paymentMethod,
    instructions: withAutoLine('', LOADING_TYPES[0], false),
    site: defaultSite(sites),
    poRef: '',
  }
}

type QuoteChoices = Pick<NewOrderForm, 'lines' | 'shipmentMethod' | 'source' | 'site'>

/**
 * The chosen lines (an item and a qty > 0) as form line indexes, and the order-quote request for them: null when there's
 * nothing to price yet (no chosen line, no source, or Delivery without a site).
 */
export function quoteRequest(form: QuoteChoices, items: OrderOptionsDto['items']): { request: OrderQuoteRequest | null; indexes: number[] } {
  const indexes: number[] = []
  const lines: OrderQuoteRequest['lines'] = []
  ;(form.lines ?? []).forEach((line, index) => {
    const item = items.find((each) => each.code === line.code)
    const qty = Number(line.qty)
    if (!item || !Number.isFinite(qty) || qty <= 0) return
    indexes.push(index)
    lines.push({ code: item.code, uom: item.uom, qty })
  })
  const site = form.shipmentMethod === 'delivery' ? form.site : ''
  const ready = lines.length > 0 && Boolean(form.source) && (form.shipmentMethod === 'pickup' || Boolean(site))
  return { request: ready ? { shipmentMethod: form.shipmentMethod, source: form.source, site, lines } : null, indexes }
}
