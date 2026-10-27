import type { ComponentProps } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export type PillTone = 'good' | 'warn' | 'bad' | 'neutral' | 'progress'

// DESIGN.md §5–6: rounded pill with a 6px currentColor dot.
const pill = cva(
  "inline-flex items-center gap-[5px] rounded-full px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:content-['']",
  {
    variants: {
      tone: {
        good: 'bg-success-soft text-success',
        warn: 'bg-warning-soft text-warning',
        bad: 'bg-destructive-soft text-destructive',
        neutral: 'bg-accent text-accent-foreground',
        progress: 'bg-primary text-primary-foreground',
      },
    },
  },
)

/** Status pill. Map a domain's statuses to a tone where they're shown (DESIGN.md §6); unknown → neutral. */
export function StatusPill({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { tone?: PillTone }) {
  return <span data-tone={tone} className={cn(pill({ tone }), className)} {...props} />
}
