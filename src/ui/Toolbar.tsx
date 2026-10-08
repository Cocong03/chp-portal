import type { ReactNode } from 'react'
import { Button } from '@/ui/button'

/** Filter row above a table (DESIGN.md §5): filters, spacer, Clear filters. */
export function Toolbar({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
      {children}
      <div className="flex-1" />
      <Button variant="outline" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  )
}
