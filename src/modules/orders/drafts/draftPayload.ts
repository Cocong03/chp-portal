import type { DraftPayload, OrderOptionsDto, SiteDto } from '@/api/types'
import { lineAmount, newOrderDefaults, type NewOrderForm } from '../new/form'

export function toPayload(form: NewOrderForm): DraftPayload {
  return { version: 1, orderType: form.orderType, form }
}

/**
 * The form a draft reopens with. Saved values replace the defaults only where their type matches; an item, site or
 * plant that no longer exists comes back empty (spec decision 6). `sites` undefined = the list isn't available, so the
 * saved site is kept rather than lost on the next save. A draft never gets the default site.
 */
export function fromDraft(payload: DraftPayload, options: OrderOptionsDto, sites: SiteDto[] | undefined): NewOrderForm {
  const defaults = newOrderDefaults(options, sites ?? [])
  const saved = (payload.form ?? {}) as unknown as Record<string, unknown>
  const form = { ...defaults } as unknown as Record<string, unknown>
  for (const key of Object.keys(defaults)) {
    if (typeof saved[key] === typeof form[key]) form[key] = saved[key]
  }
  const result = form as unknown as NewOrderForm
  const lines = Array.isArray(saved.lines) ? (saved.lines as { code?: unknown; qty?: unknown }[]) : []
  result.lines = lines.length
    ? lines.map((line) => ({
        code: options.items.some((item) => item.code === line.code) ? (line.code as string) : '',
        qty: typeof line.qty === 'number' ? line.qty : 1,
      }))
    : defaults.lines
  const site = typeof saved.site === 'string' ? saved.site : ''
  result.site = !sites || sites.some((each) => each.code === site) ? site : ''
  if (!options.plants.some((plant) => plant.code === result.source)) result.source = ''
  if (result.paymentMethod !== 'cash' && result.paymentMethod !== 'terms') result.paymentMethod = defaults.paymentMethod
  if (result.shipmentMethod !== 'pickup' && result.shipmentMethod !== 'delivery') result.shipmentMethod = defaults.shipmentMethod
  return result
}

/** Drafts tab Est. total, display only (rule 5): current prices × qty, plus current freight and other charges. */
export function estTotal(payload: DraftPayload, options: OrderOptionsDto): number {
  const form = payload.form
  const subtotal = (form.lines ?? []).reduce((sum, line) => sum + (lineAmount(line, options.items) ?? 0), 0)
  return subtotal + (options.freight[form.shipmentMethod] ?? 0) + options.otherCharges
}
