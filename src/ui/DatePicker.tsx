import { useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/ui/button'
import { Calendar } from '@/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'

/** Toolbar date filter (DESIGN.md §5: Popover + Calendar). Works in YYYY-MM-DD strings, '' for none. The visible text
 * ("From Oct 1, 2026") is the accessible name, so screen readers hear the applied date. */
export function DatePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const parsed = value ? parseISO(value) : undefined
  const date = parsed && isValid(parsed) ? parsed : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={date ? `${label} ${format(date, 'MMM d, yyyy')}` : label}
          className="min-w-[135px] justify-start font-normal"
        >
          <CalendarDays aria-hidden className="text-faint" />
          <span className="text-xs text-faint">{label}</span>
          {date && <span>{format(date, 'MMM d, yyyy')}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          onSelect={(picked) => {
            onChange(picked ? format(picked, 'yyyy-MM-dd') : '')
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
