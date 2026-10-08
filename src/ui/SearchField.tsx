import type { ComponentProps } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/ui/input'

/** Toolbar search box (wireframe `.field-inline`): leading search icon, accessible label. */
export function SearchField({ label, className, ...props }: Omit<ComponentProps<'input'>, 'type'> & { label: string }) {
  return (
    <div className={cn('relative min-w-[200px] flex-1', className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
      <Input type="search" aria-label={label} className="pl-9" {...props} />
    </div>
  )
}
