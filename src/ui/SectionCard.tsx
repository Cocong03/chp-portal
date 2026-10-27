import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/ui/card'

/** Wireframe `.card` with its uppercase `h2`. */
export function SectionCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('mb-5 gap-0 rounded-xl p-[18px] shadow-card', className)}>
      <h2 className="mb-3.5 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </Card>
  )
}
