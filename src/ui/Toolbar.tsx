import type { ReactNode } from 'react'
import { Button } from '@/ui/button'

/** Filter row above a table (DESIGN.md §5): filters, spacer, Clear filters, then the export button (`actions`) last. */
export function Toolbar({ children, onClear, actions }: { children: ReactNode; onClear: () => void; actions?: ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
      {children}
      <div className="flex-1" />
      <Button variant="outline" onClick={onClear}>
        Clear filters
      </Button>
      {actions}
    </div>
  )
}
