import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import type { DraftDto } from '@/api/types'
import { formatDate, peso } from '@/lib/format'
import { usePageTitle } from '@/lib/usePageTitle'
import { useSites } from '@/modules/sites/useSites'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog'
import { PageHeader } from '@/ui/PageHeader'
import { QueryError } from '@/ui/QueryError'
import { SectionCard } from '@/ui/SectionCard'
import { Skeleton } from '@/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'
import { useOrderOptions } from '../new/useOrderOptions'
import { estTotal } from './draftPayload'
import { useDeleteDraft, useDrafts } from './useDrafts'

/** Drafts tab (S3-12), built to the wireframe's `#panel-drafts` and `#delete-draft-modal`. */
export function DraftsPage() {
  usePageTitle('Drafts')
  const drafts = useDrafts()
  const options = useOrderOptions().data
  const sites = useSites().data
  const remove = useDeleteDraft()
  const [pending, setPending] = useState<DraftDto | null>(null)

  const siteLabel = (code: string) => {
    const site = sites?.find((each) => each.code === code)
    return site ? `${site.code} — ${site.name}` : '—'
  }
  const total = (draft: DraftDto) => {
    const value = options ? estTotal(draft.payload, options) : null
    return value === null ? '—' : peso(value)
  }
  const confirmDelete = () => {
    if (!pending) return
    const { label } = pending
    remove.mutate(pending.id, {
      onSuccess: () => toast.success(`${label} deleted`),
      onError: () => toast.error("We couldn't delete this draft. Please try again."),
      onSettled: () => setPending(null),
    })
  }

  return (
    <>
      <PageHeader title="Drafts">
        <Button asChild>
          <Link to="/orders/new">+ New Order</Link>
        </Button>
      </PageHeader>
      <SectionCard title="Drafts">
        {drafts.isError && !drafts.data ? (
          <QueryError onRetry={() => void drafts.refetch()} />
        ) : !drafts.data ? (
          <div role="status" className="flex flex-col gap-2">
            <span className="sr-only">Loading…</span>
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : (
          <Table aria-label="Drafts">
            <TableHeader>
              <TableRow>
                <TableHead>Draft</TableHead>
                <TableHead>Last saved</TableHead>
                <TableHead>Delivery site</TableHead>
                <TableHead className="text-right">Est. total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {drafts.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No saved drafts. Start a new order and choose "Save as draft" to come back to it later.
                  </TableCell>
                </TableRow>
              ) : (
                drafts.data.map((draft) => (
                  <TableRow key={draft.id}>
                    <TableCell>
                      {draft.label}{' '}
                      <span className="ml-1 rounded bg-accent px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-accent-foreground">
                        {draft.payload.orderType === 'blanket' ? 'Blanket' : 'Single'}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(draft.savedAt)}</TableCell>
                    <TableCell>{draft.payload.form?.site ? siteLabel(draft.payload.form.site) : '—'}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{total(draft)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-0.5">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/orders/new?draft=${draft.id}`}>Continue</Link>
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setPending(draft)}>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      <Dialog open={pending !== null} onOpenChange={(open) => !open && !remove.isPending && setPending(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader className="text-left">
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>This cannot be undone, are you sure you want to proceed?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={remove.isPending}>
              Delete draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
