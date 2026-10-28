import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { GENERIC_ERROR, serverLogic } from '@/api/serverLogic'
import type { MeDto, RequestSubmitDto, RequestTaxonomyDto, SubmitResultDto } from '@/api/types'
import { useMe } from '@/auth/useMe'
import { useSites } from '@/modules/sites/useSites'
import { Button } from '@/ui/button'
import { DateField } from '@/ui/DateField'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { QueryError } from '@/ui/QueryError'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { AttachmentField, ATTACHMENT_ACCEPT, checkContact, ContactFields, contactShape, EMAIL_RE, useAttachment } from './serviceForm'
import { useOrderNumbers } from './useOrderNumbers'
import { useRequestTaxonomy } from './useRequests'

type FieldKind = 'text' | 'order' | 'site' | 'date'
/** The template's category fields. A key the taxonomy names that is not here is not rendered or required. */
const FIELDS: Record<string, { label?: string; placeholder?: string; kind: FieldKind; max?: number }> = {
  order: { kind: 'order' },
  trip: { label: 'Trip ID reference', placeholder: 'e.g. TRP-88231', kind: 'text', max: 50 },
  site: { label: 'Delivery site (Ship-to Address)', kind: 'site' },
  docref: { label: 'Document reference', placeholder: 'e.g. DR-100455-01', kind: 'text', max: 50 },
  docdate: { label: 'Date of document', kind: 'date' },
  userEmail: { label: 'Affected user email', placeholder: 'e.g. user@sample-customer.ph', kind: 'text', max: 200 },
}
type Category = RequestTaxonomyDto['categories'][number]

const labelOf = (key: string, category: Category) => (key === 'order' ? (category.fields.orderLabel ?? 'Sales Order Number') : FIELDS[key].label!)
const visibleKeys = (category?: Category) => (category?.fields.rows ?? []).filter((key) => key in FIELDS)

const textarea =
  'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30'

function buildSchema(category?: Category) {
  const keys = visibleKeys(category)
  const optional = category?.fields.optional ?? []
  return z
    .object({
      category: z.string().min(1, 'Select a category.'),
      requestType: z.string().min(1, 'Select a request type.'),
      ...contactShape,
      details: z.string().trim().min(1, 'Enter the request details.').max(4000, 'Keep the details to 4,000 characters.'),
      additionalInfo: z.string().trim().max(4000, 'Keep this to 4,000 characters.'),
      fields: z.record(z.string(), z.string()),
    })
    .superRefine((values, ctx) => {
      checkContact(values, ctx)
      for (const key of keys) {
        const value = (values.fields[key] ?? '').trim()
        const label = labelOf(key, category!)
        const message = value.length > (FIELDS[key].max ?? 200) ? `${label} is too long.` : !value && !optional.includes(key) ? `${label} is required.` : ''
        if (message || (key === 'userEmail' && value && !EMAIL_RE.test(value))) {
          ctx.addIssue({ code: 'custom', path: ['fields', key], message: message || 'Enter a valid email address.' })
        }
      }
    })
}
type Values = z.infer<ReturnType<typeof buildSchema>>

function RequestForm({ me, taxonomy, onClose }: { me: MeDto; taxonomy: RequestTaxonomyDto; onClose: () => void }) {
  const queryClient = useQueryClient()
  const sites = useSites()
  const orders = useOrderNumbers()
  const file = useAttachment('request')
  const send = useMutation({ mutationFn: (body: RequestSubmitDto) => serverLogic<SubmitResultDto>('requests', { method: 'POST', body }) })

  const [categoryName, setCategoryName] = useState('')
  const category = taxonomy.categories.find((c) => c.name === categoryName)
  const schema = useMemo(() => buildSchema(category), [category])
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: '', requestType: '', contactMethod: 'Email', contactValue: me.contact.email, details: '', additionalInfo: '', fields: {},
    },
  })
  const requestType = useWatch({ control, name: 'requestType' })
  const group = category?.types.find((t) => t.type === requestType)?.group ?? ''
  const keys = visibleKeys(category)

  const onSubmit = handleSubmit(async (values) => {
    // Only the chosen category's fields go to the server; values typed under an earlier category are dropped here.
    const fields = Object.fromEntries(keys.map((key) => [key, (values.fields[key] ?? '').trim()]).filter(([, value]) => value))
    try {
      const result = await send.mutateAsync({
        category: values.category, requestType: values.requestType, contactMethod: values.contactMethod,
        contactValue: values.contactValue, details: values.details, additionalInfo: values.additionalInfo, fields, attachment: file.attachment,
      })
      if ('invalid' in result) return void toast.error('Please check the form and try again.')
      // The server answers an empty ref when the request was saved but its number could not be read back.
      toast.success(result.ref ? `Request ${result.ref} submitted.` : 'Request submitted.')
      void queryClient.invalidateQueries({ queryKey: ['requests'] })
      onClose()
    } catch {
      toast.error(GENERIC_ERROR)
    }
  })

  const fieldError = (key: string) => errors.fields?.[key]
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
      <dl className="rounded-lg bg-muted px-4 py-3">
        <dt className="text-[11px] font-semibold tracking-wider text-faint uppercase">Requestor</dt>
        <dd className="text-[13.5px]">{me.contact.name}</dd>
      </dl>

      <Field data-invalid={!!errors.category}>
        <FieldLabel htmlFor="rq-category">Category</FieldLabel>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value)
                setCategoryName(value)
                setValue('requestType', '')
              }}
            >
              <SelectTrigger id="rq-category" className="w-full" aria-invalid={!!errors.category}>
                <SelectValue placeholder="Select a category…" />
              </SelectTrigger>
              <SelectContent>
                {taxonomy.categories.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[errors.category]} />
      </Field>

      <Field data-invalid={!!errors.requestType}>
        <FieldLabel htmlFor="rq-type">Request type</FieldLabel>
        <Controller
          control={control}
          name="requestType"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={!category}>
              <SelectTrigger id="rq-type" className="w-full" aria-invalid={!!errors.requestType}>
                <SelectValue placeholder={category ? 'Select a request type…' : 'Select a category first…'} />
              </SelectTrigger>
              <SelectContent>
                {category?.types.map((t) => (
                  <SelectItem key={t.type} value={t.type}>
                    {t.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[errors.requestType]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="rq-group">Assigned group</FieldLabel>
        <Input id="rq-group" readOnly value={group} placeholder="Filled in once a request type is chosen" className="bg-muted" />
      </Field>

      {category &&
        keys.map((key) => {
          const meta = FIELDS[key]
          const id = `rq-field-${key}`
          return (
            <Field key={`${category.name}-${key}`} data-invalid={!!fieldError(key)}>
              <FieldLabel htmlFor={id}>{labelOf(key, category)}</FieldLabel>
              <Controller
                control={control}
                name={`fields.${key}`}
                defaultValue=""
                render={({ field }) => {
                  // A picker with nothing to list (loading, failed or empty) would open as a blank box, so it stays closed and says why.
                  const choose = (items: { value: string; label: string }[] | undefined, placeholder: string, status: string) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={!items?.length}>
                      <SelectTrigger id={id} className="w-full" aria-invalid={!!fieldError(key)}>
                        <SelectValue placeholder={items?.length ? placeholder : status} />
                      </SelectTrigger>
                      <SelectContent>
                        {items?.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                  if (meta.kind === 'order') {
                    const status = orders.isPending ? 'Loading sales orders…' : orders.isError ? "Couldn't load your sales orders" : 'No sales orders on your account'
                    return choose(orders.data?.map((so) => ({ value: so, label: so })), 'Select a sales order…', status)
                  }
                  if (meta.kind === 'site') {
                    const status = sites.isPending ? 'Loading delivery sites…' : sites.isError ? "Couldn't load your delivery sites" : 'No delivery sites on your account'
                    return choose(sites.data?.map((s) => ({ value: s.code, label: `${s.code} — ${s.name}` })), 'Select a delivery site…', status)
                  }
                  if (meta.kind === 'date') return <DateField id={id} value={field.value ?? ''} onChange={field.onChange} />
                  return <Input id={id} {...field} value={field.value ?? ''} placeholder={meta.placeholder} aria-invalid={!!fieldError(key)} />
                }}
              />
              <FieldError errors={[fieldError(key)]} />
            </Field>
          )
        })}

      <Field data-invalid={!!errors.details}>
        <FieldLabel htmlFor="rq-details">Request details</FieldLabel>
        <textarea
          id="rq-details"
          {...register('details')}
          className={textarea}
          placeholder="What you need, and any details your account team will need"
          aria-invalid={!!errors.details}
        />
        <FieldError errors={[errors.details]} />
      </Field>

      <Field data-invalid={!!errors.additionalInfo}>
        <FieldLabel htmlFor="rq-additional">Additional information (optional)</FieldLabel>
        <textarea id="rq-additional" {...register('additionalInfo')} className={textarea} aria-invalid={!!errors.additionalInfo} />
        <FieldError errors={[errors.additionalInfo]} />
      </Field>

      <ContactFields control={control} onMethodChange={(method) => setValue('contactValue', method === 'Email' ? me.contact.email : '')} />

      <AttachmentField
        label="Attach a supporting document (optional)"
        accept={ATTACHMENT_ACCEPT.request}
        error={file.error}
        onChange={(picked) => void file.pick(picked)}
      />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || file.reading}>
          Submit request
        </Button>
      </DialogFooter>
    </form>
  )
}

/** The wireframe's `#request-modal` (S4-04): category and type cascade, the category's fields, contact and an attachment. */
export function NewRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100vh-40px)] max-w-[720px] overflow-y-auto rounded-2xl p-[22px]">
        <DialogHeader>
          <DialogTitle>New request</DialogTitle>
          <DialogDescription className="sr-only">Send a request to your account team</DialogDescription>
        </DialogHeader>
        <DialogBody onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

/** Loads what the form needs; mounted only while the dialog is open, so the page's own loads are untouched. */
function DialogBody({ onClose }: { onClose: () => void }) {
  const me = useMe()
  const taxonomy = useRequestTaxonomy()
  if (me.data && taxonomy.data) return <RequestForm me={me.data} taxonomy={taxonomy.data} onClose={onClose} />
  if (me.isError || taxonomy.isError) return <QueryError onRetry={() => void (me.isError ? me.refetch() : taxonomy.refetch())} />
  return (
    <p role="status" className="text-[13.5px] text-muted-foreground">
      Loading…
    </p>
  )
}
