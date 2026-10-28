import type { OrderOptionsDto, OrderQuoteRequest, OrderSubmitRequest, SiteDto } from '@/api/types'
import type { ScheduleRow } from '../schedule'
import { withAutoLine } from './instructions'

/** Everything the New Order form holds: saved as a draft (S3-12) or submitted to BC (S3-10). */
export interface NewOrderForm {
  orderType: 'single' | 'blanket'
  /** `price`: the customer's agreed unit price, typed in Blanket mode only (S3-16); BC prices Single Orders. */
  lines: { code: string; qty: number; price?: number }[]
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
  /** Blanket Order delivery schedule (S3-16): planning only, saved with drafts, never sent. */
  schedule: ScheduleRow[]
}

// Wireframe option lists.
export const LOADING_TYPES = ['Loose pile', 'Palletized', 'Jumbo Bag']
// BC's Receiving Time codes, not the wireframe's windows (decided 2026-10-26): EARLY 12–8am, DAY 8am–5pm, NIGHT 5pm–12am, 24H.
export const TIME_WINDOWS = [
  { value: 'EARLY', label: '12:00 MN – 8:00 AM' },
  { value: 'DAY', label: '8:00 AM – 5:00 PM' },
  { value: 'NIGHT', label: '5:00 PM – 12:00 MN' },
  { value: '24H', label: 'Anytime' },
]

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
    timeWindow: 'DAY',
    loadingType: LOADING_TYPES[0],
    callBefore: false,
    paymentMethod: 'cash',
    instructions: withAutoLine('', LOADING_TYPES[0], false),
    site: defaultSite(sites),
    poRef: '',
    schedule: [],
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

/** The orders POST for this form, or null when there's nothing BC can price yet (see quoteRequest). */
export function submitRequest(form: NewOrderForm, items: OrderOptionsDto['items']): OrderSubmitRequest | null {
  const { request } = quoteRequest(form, items)
  if (!request) return null
  return {
    ...request,
    paymentMethod: form.paymentMethod,
    poRef: form.poRef.trim(),
    pickupDate: form.pickupDate,
    requestedDate: form.requestedDate,
    receivingPerson: form.receivingPerson.trim(),
    receivingContact: form.receivingContact.trim(),
    receivingEmail: form.receivingEmail.trim(),
    timeWindow: form.timeWindow,
    instructions: withAutoLine(form.instructions, form.loadingType, form.callBefore),
  }
}

// Wireframe gap (spec decision 10): Blanket submit waits on CHP (where a new Blanket Order starts) and BC (a writable price).
export const BLANKET_SUBMIT_NOTE = "Blanket Orders can't be submitted from the portal yet. Save as draft to keep this order."

/** A unit price the customer can agree to: a finite amount of at least ₱0.01. */
export function validPrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price >= 0.01
}

/**
 * Blanket Order subtotal from the typed prices (display only, spec decision 9): qty × price over the lines with an item and
 * a qty > 0, in centavos. null while there's no such line or one of them has no valid price.
 */
export function typedSubtotal(lines: NewOrderForm['lines'], items: OrderOptionsDto['items']): number | null {
  const chosen = (lines ?? []).filter((line) => items.some((item) => item.code === line.code) && Number(line.qty) > 0)
  if (!chosen.length || !chosen.every((line) => validPrice(line.price))) return null
  return Math.round(chosen.reduce((sum, line) => sum + Number(line.qty) * line.price! * 100, 0)) / 100
}

/** Why the server would refuse this order, in the customer's words; null when it wouldn't. `today` is YYYY-MM-DD. */
export function submitProblem(form: NewOrderForm, today: string): string | null {
  const delivery = form.shipmentMethod === 'delivery'
  const date = delivery ? form.requestedDate : form.pickupDate
  if (date && date < today) return 'Please choose a date from today onwards.'
  const email = form.receivingEmail.trim()
  if (delivery && email && !/^[^@\s]+@[^@\s]+$/.test(email)) return 'Please enter a valid receiving email.'
  return null
}
