import { useId } from 'react'
import { Controller, useFormState, useWatch, type Control } from 'react-hook-form'
import { z } from 'zod'
import type { AttachmentDto, ContactMethod } from '@/api/types'
import { useMe } from '@/auth/useMe'
import { SegmentedToggle } from '@/modules/orders/new/SegmentedToggle'
import { Field, FieldError, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'

// The server validates with the same values.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MOBILE_RE = /^(\+63|0)9\d{2}[ -]?\d{3}[ -]?\d{4}$/
export const MAX_ATTACHMENT_BYTES = 5_242_880

type Kind = 'request' | 'complaint'
const EXTENSIONS: Record<Kind, string[]> = {
  request: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.gif', '.webp'],
  complaint: ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.webp'],
}
export const ATTACHMENT_ACCEPT: Record<Kind, string> = { request: EXTENSIONS.request.join(','), complaint: EXTENSIONS.complaint.join(',') }
const TYPE_ERROR: Record<Kind, string> = {
  request: "This file type can't be attached. Use a PDF, Word, Excel or image file.",
  complaint: "This file type can't be attached. Use a PDF, Word or image file.",
}

/** Checks size and type, then reads the file as base64 (the Server Logic takes JSON). */
export async function readAttachment(file: File, kind: Kind): Promise<AttachmentDto | { error: string }> {
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: 'This file is too large. Attach a file of 5 MB or less.' }
  const dot = file.name.lastIndexOf('.')
  if (dot < 0 || !EXTENSIONS[kind].includes(file.name.slice(dot).toLowerCase())) return { error: TYPE_ERROR[kind] }
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  return { name: file.name, base64: url.slice(url.indexOf(',') + 1) }
}

export const contactShape = {
  contactMethod: z.enum(['Email', 'Mobile']),
  contactValue: z.string().trim().max(200),
}
type ContactValues = { contactMethod: ContactMethod; contactValue: string }

/** Zod 4 can't extend a refined object, so forms that add fields call this from their own superRefine. */
export function checkContact({ contactMethod, contactValue }: ContactValues, ctx: z.RefinementCtx) {
  const ok = contactMethod === 'Email' ? EMAIL_RE.test(contactValue) : MOBILE_RE.test(contactValue)
  if (!ok) {
    ctx.addIssue({
      code: 'custom',
      path: ['contactValue'],
      message: contactMethod === 'Email' ? 'Enter a valid email address.' : 'Enter a valid mobile number, e.g. 0917 552 6613.',
    })
  }
}

export const contactSchema = z.object(contactShape).superRefine(checkContact)

/** Preferred contact method toggle, its value input, and the read-only Contact person. */
export function ContactFields<T extends ContactValues>({
  control,
  onMethodChange,
}: {
  control: Control<T>
  onMethodChange?: (method: ContactMethod) => void
}) {
  const form = control as unknown as Control<ContactValues>
  const me = useMe().data
  const { errors } = useFormState({ control: form })
  const email = useWatch({ control: form, name: 'contactMethod' }) === 'Email'
  const valueId = useId()
  const personId = useId()
  return (
    <>
      <Field>
        <span className="text-sm font-medium">Preferred contact method</span>
        <Controller
          control={form}
          name="contactMethod"
          render={({ field }) => (
            <SegmentedToggle
              label="Preferred contact method"
              value={field.value}
              options={[
                { value: 'Email', label: 'Email' },
                { value: 'Mobile', label: 'Mobile' },
              ]}
              onChange={(method) => {
                field.onChange(method)
                onMethodChange?.(method)
              }}
            />
          )}
        />
      </Field>
      <Controller
        control={form}
        name="contactValue"
        render={({ field }) => (
          <Field data-invalid={!!errors.contactValue}>
            <FieldLabel htmlFor={valueId}>{email ? 'Email address' : 'Mobile number'}</FieldLabel>
            <Input
              id={valueId}
              {...field}
              type={email ? 'email' : 'tel'}
              placeholder={email ? 'e.g. jd.santos@sample-customer.ph' : 'e.g. 0917 552 6613'}
              aria-invalid={!!errors.contactValue}
            />
            <FieldError errors={[errors.contactValue]} />
          </Field>
        )}
      />
      <Field>
        <FieldLabel htmlFor={personId}>Contact person</FieldLabel>
        <Input id={personId} readOnly value={me?.contact.name ?? ''} className="bg-muted" />
      </Field>
    </>
  )
}

/** File input for one optional supporting document; the caller reads it with `readAttachment`. */
export function AttachmentField({
  label,
  accept,
  onChange,
  error,
}: {
  label: string
  accept: string
  onChange: (file: File | null) => void
  error?: string
}) {
  const id = useId()
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type="file" accept={accept} aria-invalid={!!error} onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
      <FieldError>{error}</FieldError>
    </Field>
  )
}
