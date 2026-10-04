import type { ReactNode } from 'react'

/** Panel head: h1 + caption on the left, actions on the right. Captions span the full width (S1-09). */
export function PageHeader({ title, caption, children }: { title: string; caption?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="mb-1 text-[19px] font-bold">{title}</h1>
        {caption && <p className="text-[13px] text-muted-foreground">{caption}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2.5">{children}</div>}
    </div>
  )
}
