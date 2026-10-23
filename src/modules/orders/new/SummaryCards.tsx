import type { ReactNode } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import type { OrderOptionsDto, SiteDto } from '@/api/types'
import { peso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDashboard } from '@/modules/dashboard/useDashboard'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { SectionCard } from '@/ui/SectionCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Skeleton } from '@/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip'
import { chosenLines, lineAmount, type NewOrderForm } from './form'

function Row({ label, value, total }: { label: string; value: ReactNode; total?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3 py-1.5 text-[13px]', total && 'mt-1 border-t pt-2.5 font-bold')}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

/** Disabled until Submit (S3-10). A disabled button gets no hover, so the tooltip sits on a wrapper. */
function Soon({ children }: { children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="flex-1">
          <Button type="button" disabled className="w-full">
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Available soon.</TooltipContent>
    </Tooltip>
  )
}

/** Credit standing (BC's credit overview, via the dashboard endpoint) and Order summary. Display sums only; the real quote is S3-06. */
export function SummaryCards({
  options,
  sites,
  onSaveDraft,
  saving,
}: {
  options: OrderOptionsDto
  sites: SiteDto[]
  onSaveDraft: () => void
  saving: boolean
}) {
  const { control, register } = useFormContext<NewOrderForm>()
  const [lines, shipmentMethod, siteCode] = useWatch({ control, name: ['lines', 'shipmentMethod', 'site'] })
  const { count, priced } = chosenLines(lines, options.items)
  const subtotal = lines.reduce((sum, line) => sum + (lineAmount(line, options.items) ?? 0), 0)
  const freight = options.freight[shipmentMethod]
  const total = subtotal + freight + options.otherCharges
  // BC items have no price until the quote (S3-06): every amount is "—", never a partial or made-up total.
  const amount = (value: number) => (priced ? peso(value) : '—')
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
          <Input id="po-ref" placeholder="e.g. PO-8915" {...register('poRef')} />
        </div>
        <Row label="Lines" value={count} />
        <Row label="Subtotal" value={amount(subtotal)} />
        <Row label="Transport / Freight" value={amount(freight)} />
        <Row label="Other charges" value={amount(options.otherCharges)} />
        <Row label="Order total" value={amount(total)} total />
        {priced && available !== null && total > available && (
          <p className="mt-2 text-[12.5px] font-medium text-warning">
            ⚠ This order exceeds your available credit. You may still submit it for review by our credit team.
          </p>
        )}
        <TooltipProvider>
          <div className="mt-4 flex gap-2.5">
            <Button type="button" variant="outline" className="flex-1" onClick={onSaveDraft} disabled={saving}>
              {saving ? 'Saving…' : 'Save as draft'}
            </Button>
            <Soon>Submit for approval</Soon>
          </div>
        </TooltipProvider>
      </SectionCard>
    </>
  )
}
