import { useEffect } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import type { OrderOptionsDto, SiteDto } from '@/api/types'
import { usePageTitle } from '@/lib/usePageTitle'
import { useSites } from '@/modules/sites/useSites'
import { PageHeader } from '@/ui/PageHeader'
import { QueryError } from '@/ui/QueryError'
import { Skeleton } from '@/ui/skeleton'
import { defaultSite, newOrderDefaults, type NewOrderForm } from './form'
import { OrderLinesCard } from './OrderLinesCard'
import { SummaryCards } from './SummaryCards'
import { useOrderOptions } from './useOrderOptions'

const NO_SITES: SiteDto[] = []

/** New Order (S3-07/S3-08), built to the wireframe's `#panel-new`. Sites from BC; the options are sample until S3-05. */
export function NewOrderPage() {
  usePageTitle('New Order')
  const options = useOrderOptions()
  // Loading or failed sites never hold up the form: the Delivery site select is simply empty and disabled.
  const sites = useSites().data ?? NO_SITES
  return (
    <>
      <PageHeader title="New Order" />
      {options.isError ? (
        <QueryError onRetry={() => void options.refetch()} />
      ) : options.data ? (
        <OrderForm options={options.data} sites={sites} />
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

function OrderForm({ options, sites }: { options: OrderOptionsDto; sites: SiteDto[] }) {
  const form = useForm<NewOrderForm>({ defaultValues: newOrderDefaults(options, sites) })
  // Sites can arrive after the form opens: pick the default then, unless one is chosen already.
  useEffect(() => {
    if (!form.getValues('site') && sites.length > 0) form.setValue('site', defaultSite(sites))
  }, [form, sites])
  return (
    <FormProvider {...form}>
      <form onSubmit={(event) => event.preventDefault()} className="grid items-start gap-x-5 lg:grid-cols-[1fr_340px]">
        <div>
          <OrderLinesCard options={options} />
        </div>
        <div>
          <SummaryCards options={options} sites={sites} />
        </div>
      </form>
    </FormProvider>
  )
}
