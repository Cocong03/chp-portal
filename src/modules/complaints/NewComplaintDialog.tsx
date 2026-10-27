import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { GENERIC_ERROR, serverLogic } from '@/api/serverLogic'
import type { ComplaintSubmitDto, ComplaintTaxonomyDto, MeDto, SubmitResultDto } from '@/api/types'
import { useMe } from '@/auth/useMe'
import { AttachmentField, ATTACHMENT_ACCEPT, checkContact, ContactFields, contactShape, useAttachment } from '@/modules/requests/serviceForm'
import { useOrderNumbers } from '@/modules/requests/useOrderNumbers'
import { useSites } from '@/modules/sites/useSites'
import { Button } from '@/ui/button'
import { DateField } from '@/ui/DateField'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { QueryError } from '@/ui/QueryError'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { useComplaintTaxonomy } from './useComplaints'

const DELIVERY = 'Delivery & Handling'
// Select items can't have an empty value, so "none" is this sentinel and is stored as ''.
const NONE = '__none'

const textarea =
  'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30'

/** Today's date in Manila (UTC+8) as YYYY-MM-DD, so the cut-off matches the customer's day. */
const manilaToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)

const schema = z
  .object({
    category: z.string().min(1, 'Select a category.'),
    complaintType: z.string().min(1, 'Select a complaint type.'),
    ...contactShape,
    incidentDate: z.string(),
    site: z.string(),
    relatedOrder: z.string(),
    subject: z.string().trim().min(1, 'Enter a subject.').max(200, 'Keep the subject to 200 characters.'),
    description: z.string().trim().max(4000, 'Keep the description to 4,000 characters.'),
    consent: z.boolean(),
  })
  .superRefine((values, ctx) => {
    checkContact(values, ctx)
    if (values.incidentDate > manilaToday()) {
      ctx.addIssue({ code: 'custom', path: ['incidentDate'], message: "The date of incident can't be in the future." })
    }
  })
type Values = z.infer<typeof schema>

function ComplaintForm({ me, taxonomy, onClose }: { me: MeDto; taxonomy: ComplaintTaxonomyDto; onClose: () => void }) {
  const queryClient = useQueryClient()
  const sites = useSites().data ?? []
  const orders = useOrderNumbers().data ?? []
  const file = useAttachment('complaint')
  const send = useMutation({ mutationFn: (body: ComplaintSubmitDto) => serverLogic<SubmitResultDto>('complaints', { method: 'POST', body }) })

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: '', complaintType: '', contactMethod: 'Email', contactValue: me.contact.email,
      incidentDate: '', site: '', relatedOrder: '', subject: '', description: '', consent: false,
    },
  })
  const categoryName = useWatch({ control, name: 'category' })
  const complaintType = useWatch({ control, name: 'complaintType' })
  const consent = useWatch({ control, name: 'consent' })
  const category = taxonomy.categories.find((c) => c.name === categoryName)
  const group = category?.types.find((t) => t.type === complaintType)?.group ?? ''

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await send.mutateAsync({
        category: values.category, complaintType: values.complaintType, contactMethod: values.contactMethod,
        contactValue: values.contactValue, incidentDate: values.incidentDate, site: values.site, relatedOrder: values.relatedOrder,
        subject: values.subject, description: values.description, consent: true, attachment: file.attachment,
      })
      if ('invalid' in result) return void toast.error('Please check the form and try again.')
      // The server answers an empty ref when the complaint was saved but its number could not be read back.
      toast.success(result.ref ? `Complaint ${result.ref} submitted.` : 'Complaint submitted.')
      void queryClient.invalidateQueries({ queryKey: ['complaints'] })
      onClose()
    } catch {
      toast.error(GENERIC_ERROR)
    }
  })

  const choose = (id: string, value: string, onChange: (value: string) => void, none: string, items: { value: string; label: string }[]) => (
    <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? '' : next)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{none}</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted px-4 py-3">
        <div>
          <dt className="text-[11px] font-semibold tracking-wider text-faint uppercase">Submitted By</dt>
          <dd className="text-[13.5px]">{me.contact.name}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-wider text-faint uppercase">BC Account Number</dt>
          <dd className="text-[13.5px]">{me.account?.customerNo ?? '—'}</dd>
        </div>
      </dl>

      <Field data-invalid={!!errors.category}>
        <FieldLabel htmlFor="cp-category">Category</FieldLabel>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value)
                setValue('complaintType', '')
                setValue('site', '')
              }}
            >
              <SelectTrigger id="cp-category" className="w-full" aria-invalid={!!errors.category}>
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

      <Field data-invalid={!!errors.complaintType}>
        <FieldLabel htmlFor="cp-type">Complaint type</FieldLabel>
        <Controller
          control={control}
          name="complaintType"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={!category}>
              <SelectTrigger id="cp-type" className="w-full" aria-invalid={!!errors.complaintType}>
                <SelectValue placeholder={category ? 'Select a complaint type…' : 'Select a category first…'} />
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
        <FieldError errors={[errors.complaintType]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="cp-group">Assigned group</FieldLabel>
        <Input id="cp-group" readOnly value={group} placeholder="Filled in once a complaint type is chosen" className="bg-muted" />
      </Field>

      <ContactFields control={control} onMethodChange={(method) => setValue('contactValue', method === 'Email' ? me.contact.email : '')} />

      <Field data-invalid={!!errors.incidentDate}>
        <FieldLabel htmlFor="cp-date">Date of incident (optional)</FieldLabel>
        <Controller control={control} name="incidentDate" render={({ field }) => <DateField id="cp-date" value={field.value} onChange={field.onChange} />} />
        <FieldError errors={[errors.incidentDate]} />
      </Field>

      {categoryName === DELIVERY && (
        <Field>
          <FieldLabel htmlFor="cp-site">Delivery site (optional)</FieldLabel>
          <Controller
            control={control}
            name="site"
            render={({ field }) =>
              choose('cp-site', field.value, field.onChange, 'Not Applicable', sites.map((s) => ({ value: `${s.code} — ${s.name}`, label: `${s.code} — ${s.name}` })))
            }
          />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="cp-order">Related order (optional)</FieldLabel>
        <Controller
          control={control}
          name="relatedOrder"
          render={({ field }) => choose('cp-order', field.value, field.onChange, 'Not related to a specific order', orders.map((so) => ({ value: so, label: so })))}
        />
      </Field>

      <Field data-invalid={!!errors.subject}>
        <FieldLabel htmlFor="cp-subject">Subject</FieldLabel>
        <Input id="cp-subject" {...register('subject')} placeholder="A short summary" aria-invalid={!!errors.subject} />
        <FieldError errors={[errors.subject]} />
      </Field>

      <Field data-invalid={!!errors.description}>
        <FieldLabel htmlFor="cp-description">Description</FieldLabel>
        <textarea
          id="cp-description"
          {...register('description')}
          className={textarea}
          placeholder="What happened, and any details your account team will need"
          aria-invalid={!!errors.description}
        />
        <FieldError errors={[errors.description]} />
      </Field>

      <AttachmentField
        label="Attach a photo or document (optional)"
        accept={ATTACHMENT_ACCEPT.complaint}
        error={file.error}
        onChange={(picked) => void file.pick(picked)}
      />

      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" {...register('consent')} />
        <span>
          I agree to be contacted via my registered email address or mobile number regarding updates, requests for information, and resolution of
          this case.
        </span>
      </label>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || file.reading || !consent}>
          Submit
        </Button>
      </DialogFooter>
    </form>
  )
}

/** The wireframe's `#complaint-modal` (S4-05): category and type cascade, contact, incident details, attachment and consent. */
export function NewComplaintDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100vh-40px)] max-w-[720px] overflow-y-auto rounded-2xl p-[22px]">
        <DialogHeader>
          <DialogTitle>New submission</DialogTitle>
          <DialogDescription className="sr-only">Send a complaint to your account team</DialogDescription>
        </DialogHeader>
        <DialogBody onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

/** Loads what the form needs; mounted only while the dialog is open. */
function DialogBody({ onClose }: { onClose: () => void }) {
  const me = useMe()
  const taxonomy = useComplaintTaxonomy()
  if (me.data && taxonomy.data) return <ComplaintForm me={me.data} taxonomy={taxonomy.data} onClose={onClose} />
  if (me.isError || taxonomy.isError) return <QueryError onRetry={() => void (me.isError ? me.refetch() : taxonomy.refetch())} />
  return (
    <p role="status" className="text-[13.5px] text-muted-foreground">
      Loading…
    </p>
  )
}
