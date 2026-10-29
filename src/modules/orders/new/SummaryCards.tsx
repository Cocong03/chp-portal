import type { ReactNode } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import type { OrderOptionsDto, SiteDto } from '@/api/types'
import { peso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDashboard } from '@/modules/dashboard/useDashboard'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { QueryError } from '@/ui/QueryError'
import { SectionCard } from '@/ui/SectionCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Skeleton } from '@/ui/skeleton'
import { typedSubtotal, type NewOrderForm } from './form'
import type { OrderQuote } from './useOrderQuote'

function Row({ label, value, total }: { label: string; value: ReactNode; total?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3 py-1.5 text-[13px]', total && 'mt-1 border-t pt-2.5 font-bold')}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

/**
 * Credit standing (BC's credit overview, via the dashboard endpoint), Order summary (BC's quote, S3-06) and Submit (S3-10).
 * A Blanket Order (S3-16) sums the typed prices for its subtotal and keeps BC's freight and other charges.
 */
export function SummaryCards({
  quote,
  items,
  sites,
  onSaveDraft,
  saving,
  onSubmit,
  submitting,
}: {
  quote: OrderQuote
  items: OrderOptionsDto['items']
  sites: SiteDto[]
  onSaveDraft: () => void
  saving: boolean
  onSubmit: () => void
  submitting: boolean
}) {
  const { control, register } = useFormContext<NewOrderForm>()
  const [siteCode, paymentMethod, orderType, lines] = useWatch({ control, name: ['site', 'paymentMethod', 'orderType', 'lines'] })
  const blanket = orderType === 'blanket'
  // BC's quote only (S3-06): "—" with nothing to price or a failed quote, never a partial or made-up total.
  const priced = quote.quote
  const amount = (key: 'subtotal' | 'freight' | 'otherCharges' | 'total') =>
    priced ? peso(priced[key]) : quote.status === 'pending' ? <Skeleton className="h-4 w-20" /> : '—'
  // Blanket: the customer's prices for the subtotal (display only), BC's charges on top; "—" until both are there.
  const typed = blanket ? typedSubtotal(lines, items) : null
  const blanketAmount = (key: 'subtotal' | 'total') =>
    typed === null ? '—' : key === 'subtotal' ? peso(typed) : priced ? peso(typed + priced.freight + priced.otherCharges) : amount('total')
  const site = sites.find((each) => each.code === siteCode)
  const dashboard = useDashboard()
  const credit = dashboard.data?.account
  const money = (value: number | null | undefined) =>
    credit ? (value == null ? '—' : peso(value)) : dashboard.isError ? '—' : <Skeleton className="h-4 w-24" />
  const available = credit?.availableCredit ?? null
  return (
    <>
      <SectionCard title="Credit standing">
        <Row label="Credit limit" value={money(credit?.creditLimit)} />
        <Row label="Current exposure" value={money(credit?.exposure)} />
        <Row label="Available credit" value={money(available)} total />
        <p className="mt-2 text-[12.5px] text-muted-foreground">Exposure = outstanding balance plus orders already placed but not yet invoiced.</p>
      </SectionCard>
      <SectionCard title="Order summary">
        <div className="mb-3 flex flex-col gap-1.5">
          <Label htmlFor="delivery-site">Delivery site</Label>
          <Controller
            control={control}
            name="site"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={sites.length === 0}>
                <SelectTrigger id="delivery-site" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((each) => (
                    <SelectItem key={each.code} value={each.code}>
                      {each.code} — {each.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {site && (
            <p className="text-[12.5px] text-muted-foreground">
              {site.name} — {site.address}, {site.city}
            </p>
          )}
        </div>
        <div className="mb-3 flex flex-col gap-1.5">
          <Label htmlFor="po-ref">Your PO reference (optional)</Label>
          <Input id="po-ref" placeholder="e.g. PO-8915" maxLength={35} {...register('poRef')} />
        </div>
        <Row label="Lines" value={quote.count} />
        <Row label="Subtotal" value={blanket ? blanketAmount('subtotal') : amount('subtotal')} />
        <Row label="Transport / Freight" value={amount('freight')} />
        <Row label="Other charges" value={amount('otherCharges')} />
        <Row label="Order total" value={blanket ? blanketAmount('total') : amount('total')} total />
        {quote.status === 'error' && (
          <div className="mt-2">
            <QueryError onRetry={quote.retry} />
          </div>
        )}
        {/* Credit orders only (S3-04): cash orders need no credit approval (decided 2026-10-26). Either one sends the order to the credit team. */}
        {paymentMethod === 'credit' && (credit?.overdue ?? 0) > 0 && (
          <p className="mt-2 text-[12.5px] font-medium text-warning">
            ⚠ Your account has a past due balance. You may still submit this order for review by our credit team.
          </p>
        )}
        {paymentMethod === 'credit' && priced && available !== null && priced.total > available && (
          <p className="mt-2 text-[12.5px] font-medium text-warning">
            ⚠ This order exceeds your available credit. You may still submit it for review by our credit team.
          </p>
        )}
        <div className="mt-4 flex gap-2.5">
          <Button type="button" variant="outline" className="flex-1" onClick={onSaveDraft} disabled={saving}>
            {saving ? 'Saving…' : 'Save as draft'}
          </Button>
          {/* Only an order BC has priced, every line of it; a Blanket Order once BC has quoted its charges and every line has a typed price. */}
          <Button
            type="button"
            className="flex-1"
            onClick={onSubmit}
            disabled={!priced || (blanket ? typed === null : priced.lines.some((line) => line.unitPrice <= 0)) || submitting}
          >
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </Button>
        </div>
      </SectionCard>
    </>
  )
}
