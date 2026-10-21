import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FormProvider, useForm } from 'react-hook-form'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import type { DraftDto, OrderOptionsDto, SiteDto } from '@/api/types'
import { formatDate } from '@/lib/format'
import { usePageTitle } from '@/lib/usePageTitle'
import { fromDraft, toPayload } from '@/modules/orders/drafts/draftPayload'
import { saveDraft, useDraft } from '@/modules/orders/drafts/useDrafts'
import { useSites } from '@/modules/sites/useSites'
import { PageHeader } from '@/ui/PageHeader'
import { QueryError } from '@/ui/QueryError'
import { Skeleton } from '@/ui/skeleton'
import { defaultSite, newOrderDefaults, type NewOrderForm } from './form'
import { FulfillmentCard } from './FulfillmentCard'
import { withAutoLine } from './instructions'
import { OrderLinesCard } from './OrderLinesCard'
import { SummaryCards } from './SummaryCards'
import { useOrderOptions } from './useOrderOptions'

const NO_SITES: SiteDto[] = []
const SAVED_NOTE = 'Saved as draft. You may go to the Drafts tab to edit, or delete.'

/** New Order (S3-07/S3-08), built to the wireframe's `#panel-new`; `?draft=<id>` continues a draft (S3-12). */
export function NewOrderPage() {
  usePageTitle('New Order')
  const [params] = useSearchParams()
  const draftId = params.get('draft')
  const justSaved = (useLocation().state as { saved?: boolean } | null)?.saved === true
  const options = useOrderOptions()
  const sites = useSites()
  const draft = useDraft(draftId)
  // A new order never waits for sites (the select is just empty). A draft does, so a slow list can't make its
  // saved site look stale; if sites fail, fromDraft keeps the saved site.
  const draftReady = !draftId || (draft.data !== undefined && (sites.data !== undefined || sites.isError))
  return (
    <>
      <PageHeader title="New Order" />
      {/* Data first: a failed background refetch keeps the form (and what the customer typed) on screen. */}
      {options.data && draftReady ? (
        <OrderForm
          key={draftId ?? 'new'}
          options={options.data}
          sites={sites.data}
          draftId={draftId}
          draft={draft.data ?? null}
          justSaved={justSaved}
        />
      ) : options.isError || draft.isError ? (
        <QueryError
          onRetry={() => {
            if (options.isError) void options.refetch()
            if (draft.isError) void draft.refetch()
          }}
        />
      ) : (
        <div role="status" className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      )}
    </>
  )
}

function OrderForm({
  options,
  sites,
  draftId,
  draft,
  justSaved,
}: {
  options: OrderOptionsDto
  sites: SiteDto[] | undefined
  draftId: string | null
  draft: DraftDto | null
  justSaved: boolean
}) {
  const form = useForm<NewOrderForm>({
    defaultValues: draft ? fromDraft(draft.payload, options, sites) : newOrderDefaults(options, sites ?? NO_SITES),
  })
  const [note, setNote] = useState(() =>
    justSaved
      ? SAVED_NOTE
      : draft
        ? `Continuing ${draft.label}, saved ${formatDate(draft.savedAt)}.`
        : draftId
          ? 'This draft is no longer available.'
          : null,
  )
  // Sites can arrive after a new order opens: pick the default then, unless one is chosen already. Never for a draft.
  useEffect(() => {
    if (!draftId && !form.getValues('site') && sites?.length) form.setValue('site', defaultSite(sites))
  }, [form, sites, draftId])

  const client = useQueryClient()
  const navigate = useNavigate()
  const save = useMutation({
    mutationFn: () => {
      const { instructions, loadingType, callBefore } = form.getValues()
      form.setValue('instructions', withAutoLine(instructions, loadingType, callBefore))
      // A draft that couldn't be found is saved as a new one, never over its old id.
      return saveDraft(draft ? draftId : null, form.getValues())
    },
    onSuccess: (saved) => {
      // Seeded with the form as it is now, so anything typed while the save was on its way survives the remount.
      client.setQueryData(['drafts', saved.id], { ...saved, payload: toPayload(form.getValues()) })
      void client.invalidateQueries({ queryKey: ['drafts'], exact: true })
      toast.success(`${saved.label} saved`, {
        description: 'You may go to the Drafts tab to edit, or delete.',
        action: { label: 'View drafts', onClick: () => navigate('/orders/drafts') },
      })
      // A new draft (or one recreated after it was removed elsewhere) moves the URL to it, so later saves update it and
      // a refresh keeps it. The key change remounts the form from the cache just seeded, with the same values.
      if (saved.id !== draftId) navigate({ search: `?draft=${saved.id}` }, { replace: true, state: { saved: true } })
      else setNote(SAVED_NOTE)
    },
    onError: () => toast.error("We couldn't save this draft. Please try again."),
  })

  return (
    <FormProvider {...form}>
      {note && (
        <p role="status" className="mb-3.5 text-[12.5px] text-accent-foreground">
          {note}
        </p>
      )}
      <form onSubmit={(event) => event.preventDefault()} className="grid items-start gap-x-5 lg:grid-cols-[1fr_340px]">
        <div>
          <OrderLinesCard options={options} />
          <FulfillmentCard options={options} />
        </div>
        <div>
          <SummaryCards options={options} sites={sites ?? NO_SITES} onSaveDraft={() => save.mutate()} saving={save.isPending} />
        </div>
      </form>
    </FormProvider>
  )
}
