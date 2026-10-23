import type { OrderOptionsDto, SiteDto } from '@/api/types'
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

/** Display only (the real quote is S3-06): qty × the item's price, or null for a line without an item, a price or a positive qty. */
export function lineAmount(line: { code: string; qty: number }, items: OrderOptionsDto['items']): number | null {
  const item = items.find((each) => each.code === line.code)
  const qty = Number(line.qty)
  return item && item.unitPrice !== null && Number.isFinite(qty) && qty > 0 ? item.unitPrice * qty : null
}

/** Lines with an item and a positive qty, and whether every one of them has a price yet. */
export function chosenLines(lines: { code: string; qty: number }[], items: OrderOptionsDto['items']) {
  const chosen = lines.filter((line) => items.some((item) => item.code === line.code) && Number(line.qty) > 0)
  return { count: chosen.length, priced: chosen.every((line) => lineAmount(line, items) !== null) }
}
