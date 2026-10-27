import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form'
import type { OrderOptionsDto } from '@/api/types'
import { peso } from '@/lib/format'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { SectionCard } from '@/ui/SectionCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Skeleton } from '@/ui/skeleton'
import type { NewOrderForm } from './form'
import { SegmentedToggle } from './SegmentedToggle'
import type { OrderQuote } from './useOrderQuote'

const num = 'text-right font-mono tabular-nums'

/** Order type and the lines table, priced by BC's quote. Blanket Order stays off until S3-16. */
export function OrderLinesCard({ options, quote }: { options: OrderOptionsDto; quote: OrderQuote }) {
  const { control, register } = useFormContext<NewOrderForm>()
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const lines = useWatch({ control, name: 'lines' })
  const price = (index: number, value: number | undefined) =>
    value !== undefined ? peso(value) : quote.status === 'pending' && quote.chosen(index) ? <Skeleton className="ml-auto h-4 w-16" /> : '—'
  return (
    <SectionCard title="Order lines">
      <SegmentedToggle
        label="Order type"
        value="single"
        options={[
          { value: 'single', label: 'Single Order' },
          { value: 'blanket', label: 'Blanket Order', disabled: true },
        ]}
        onChange={() => {}}
      />
      <p className="mt-2 mb-3.5 text-[12.5px] text-muted-foreground">For orders with agreed pricing, choose Blanket Order.</p>
      <div className="overflow-x-auto">
        <table aria-label="Order lines" className="w-full text-[13px]">
          <thead className="text-left text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="py-2 pr-2">Item</th>
              <th className={`py-2 pr-2 ${num}`}>Qty</th>
              <th className="py-2 pr-2">UOM</th>
              <th className={`py-2 pr-2 ${num}`}>Unit price</th>
              <th className={`py-2 pr-2 ${num}`}>Line total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const line = lines[index] ?? field
              const item = options.items.find((each) => each.code === line.code)
              const priced = quote.line(index)
              // One unit of measure per order (decided 2026-10-26): the other lines' UOM limits this line's items.
              const orderUom = lines.map((each, at) => (at === index ? undefined : options.items.find((one) => one.code === each.code)?.uom)).find(Boolean)
              const choices = orderUom ? options.items.filter((each) => each.uom === orderUom || each.code === line.code) : options.items
              return (
                <tr key={field.id} className="border-t">
                  <td className="py-2 pr-2">
                    <Controller
                      control={control}
                      name={`lines.${index}.code`}
                      render={({ field: select }) => (
                        <Select value={select.value} onValueChange={select.onChange}>
                          <SelectTrigger aria-label={`Item, line ${index + 1}`} className="w-[280px] max-w-full">
                            <SelectValue placeholder="Select item…" />
                          </SelectTrigger>
                          <SelectContent>
                            {choices.map((each) => (
                              <SelectItem key={each.code} value={each.code}>
                                {each.code} — {each.description}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {priced?.message && <p className="mt-1 max-w-[280px] text-[12px] text-warning">{priced.message}</p>}
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      aria-label={`Quantity, line ${index + 1}`}
                      className={`ml-auto w-24 ${num}`}
                      {...register(`lines.${index}.qty`, { valueAsNumber: true })}
                    />
                  </td>
                  <td className="py-2 pr-2 font-mono">{item?.uom ?? '—'}</td>
                  <td className={`py-2 pr-2 ${num}`}>{price(index, priced?.unitPrice)}</td>
                  <td className={`py-2 pr-2 ${num}`}>{price(index, priced?.lineAmount)}</td>
                  <td className="py-2">
                    <Button type="button" variant="ghost" size="sm" aria-label={`Remove line ${index + 1}`} onClick={() => remove(index)}>
                      ✕
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" className="mt-3 self-start" onClick={() => append({ code: '', qty: 1 })}>
        + Add line
      </Button>
    </SectionCard>
  )
}
