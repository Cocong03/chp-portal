import { Button } from '@/ui/button'

/** Wireframe `.pager`: "Showing 1–10 of 42 orders" + Prev/Next (DESIGN.md §5). */
export function Pager({
  page,
  pageSize,
  total,
  noun,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  noun: string
  onPage: (page: number) => void
}) {
  const from = total ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(page * pageSize, total)
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 text-[12.5px] text-muted-foreground">
      <span>
        Showing {from}–{to} of {total} {total === 1 ? noun : `${noun}s`}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Prev
        </Button>
        <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
          Next →
        </Button>
      </div>
    </div>
  )
}
