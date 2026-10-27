import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export type TileTone = 'neutral' | 'alert' | 'clear' | 'warn' | 'progress'

const EDGE: Record<TileTone, string> = {
  neutral: 'border-l-border',
  alert: 'border-l-destructive',
  clear: 'border-l-success',
  warn: 'border-l-warning',
  progress: 'border-l-primary',
}

/** Wireframe .stat-tile: label, large value, caption; a link (.stat-tile-clickable) when `to` is set. */
export function StatTile({ label, value, caption, tone = 'neutral', to }: { label: string; value: ReactNode; caption?: string; tone?: TileTone; to?: string }) {
  const body = (
    <>
      <div className="mb-2 text-[13px] font-semibold text-muted-foreground">{label}</div>
      <div className={cn('text-[26px] leading-tight font-bold', tone === 'alert' && 'text-destructive', tone === 'warn' && 'text-warning')}>{value}</div>
      {caption && (
        <div className={cn('mt-1.5 text-xs', to ? 'font-semibold text-primary' : tone === 'clear' ? 'text-success' : 'text-faint')}>{caption}</div>
      )}
    </>
  )
  const box = cn('block rounded-[10px] border border-l-[3px] bg-card px-5 py-[18px] shadow-card', EDGE[tone])
  return to ? (
    <Link to={to} className={cn(box, 'transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2')}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  )
}
