import { useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/ui/button'
import { Calendar } from '@/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'

/** Form date field (DESIGN.md: Popover + Calendar), labelled by a `<Label htmlFor={id}>`. YYYY-MM-DD strings, '' for none. */
export function DateField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const parsed = value ? parseISO(value) : undefined
  const date = parsed && isValid(parsed) ? parsed : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="w-full justify-start font-normal">
          <CalendarDays aria-hidden className="text-faint" />
          {date ? format(date, 'MMM d, yyyy') : <span className="text-muted-foreground">Select date…</span>}
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
