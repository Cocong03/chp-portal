import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { newScheduleRow, scheduleSummary, type ScheduleItem, type ScheduleRow } from './schedule'

const num = 'text-right font-mono tabular-nums'

/**
 * The wireframe's delivery schedule table (New Order's `#blanket-schedule-card` and the Manage schedule modal): one row per
 * planned delivery, and per ordered item how much is scheduled against what was ordered. Planning only; it never sends.
 */
export function ScheduleEditor({
  ordered,
  rows,
  onChange,
  overHint,
  emptyMessage,
}: {
  ordered: ScheduleItem[]
  rows: ScheduleRow[]
  onChange: (rows: ScheduleRow[]) => void
  /** Where the rows sit relative to the per-item summary in the wireframe's copy ("reduce a scheduled quantity above"). */
  overHint: 'above' | 'below'
  emptyMessage: string
}) {
  const summary = scheduleSummary(ordered, rows)
  const update = (index: number, change: Partial<ScheduleRow>) => onChange(rows.map((row, at) => (at === index ? { ...row, ...change } : row)))
  return (
    <>
      <div className="overflow-x-auto">
        <table aria-label="Delivery schedule" className="w-full text-[13px]">
          <thead className="text-left text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="py-2 pr-2">Item</th>
              <th className={`py-2 pr-2 ${num}`}>Est. quantity</th>
              <th className="py-2 pr-2">Expected delivery date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t">
                <td className="py-2 pr-2">
                  <Select value={summary.some((each) => each.code === row.item) ? row.item : ''} onValueChange={(item) => update(index, { item })}>
                    <SelectTrigger aria-label={`Delivery item, row ${index + 1}`} className="w-[220px] max-w-full">
                      <SelectValue placeholder="Add an order line first…" />
                    </SelectTrigger>
                    <SelectContent>
                      {summary.map((each) => (
                        <SelectItem key={each.code} value={each.code}>
                          {each.code} — {each.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    aria-label={`Est. quantity, row ${index + 1}`}
                    className={`ml-auto w-24 ${num}`}
                    value={Number.isFinite(row.qty) ? row.qty : ''}
                    onChange={(event) => update(index, { qty: event.target.valueAsNumber })}
                  />
                </td>
                <td className="py-2 pr-2">
                  <Input
                    type="date"
                    aria-label={`Expected delivery date, row ${index + 1}`}
                    className="w-[150px]"
                    value={row.date}
                    onChange={(event) => update(index, { date: event.target.value })}
                  />
                </td>
                <td className="py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove delivery ${index + 1}`}
                    onClick={() => onChange(rows.filter((_, at) => at !== index))}
                  >
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-[13px]">
            {summary.length === 0 ? (
              <tr className="border-t">
                <td colSpan={4} className="py-3.5 text-center text-faint">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              summary.map((each) => (
                <tr key={each.code} className="border-t font-semibold">
                  <td className="py-2 pr-2">
                    {each.code} — {each.description}
                  </td>
                  <td className={`py-2 pr-2 ${num}`}>
                    {each.scheduled} <span className="font-normal text-faint">/ {each.ordered} ordered</span>
                  </td>
                  <td colSpan={2} className={cn('py-2', each.over ? 'text-destructive' : 'font-normal text-muted-foreground')}>
                    {each.over
                      ? `Over by ${each.scheduled - each.ordered} — reduce a scheduled quantity ${overHint}`
                      : `${each.ordered - each.scheduled} not yet scheduled`}
                  </td>
                </tr>
              ))
            )}
          </tfoot>
        </table>
      </div>
      <Button type="button" variant="outline" className="mt-3 self-start" disabled={ordered.length === 0} onClick={() => onChange([...rows, newScheduleRow(ordered)])}>
        + Add delivery
      </Button>
    </>
  )
}
