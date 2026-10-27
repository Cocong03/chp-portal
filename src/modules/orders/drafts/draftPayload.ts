import type { DraftPayload, OrderOptionsDto, SiteDto } from '@/api/types'
import { newOrderDefaults, TIME_WINDOWS, type NewOrderForm } from '../new/form'

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
  const lines = Array.isArray(saved.lines) ? (saved.lines as { code?: unknown; qty?: unknown; price?: unknown }[]) : []
  result.lines = lines.length
    ? lines.map((line) => ({
        code: options.items.some((item) => item.code === line.code) ? (line.code as string) : '',
        qty: typeof line.qty === 'number' ? line.qty : 1,
        // Blanket drafts (S3-16) carry the typed price.
        ...(typeof line.price === 'number' ? { price: line.price } : {}),
      }))
    : defaults.lines
  if (result.orderType !== 'single' && result.orderType !== 'blanket') result.orderType = defaults.orderType
  // Typeof can't vet an array (null is an "object" too): keep only well-formed rows.
  const schedule = Array.isArray(saved.schedule) ? (saved.schedule as Record<string, unknown>[]) : []
  result.schedule = schedule
    .filter((row) => row && typeof row.item === 'string' && typeof row.qty === 'number' && typeof row.date === 'string')
    .map((row) => ({ item: row.item as string, qty: row.qty as number, date: row.date as string }))
  const site = typeof saved.site === 'string' ? saved.site : ''
  result.site = !sites || sites.some((each) => each.code === site) ? site : ''
  if (!options.plants.some((plant) => plant.code === result.source)) result.source = ''
  // Cash only until Phase 2; drafts saved before 2026-10-26 hold the wireframe's time windows.
  if (result.paymentMethod !== 'cash') result.paymentMethod = defaults.paymentMethod
  if (!TIME_WINDOWS.some((window) => window.value === result.timeWindow)) result.timeWindow = defaults.timeWindow
  if (result.shipmentMethod !== 'pickup' && result.shipmentMethod !== 'delivery') result.shipmentMethod = defaults.shipmentMethod
  return result
}
