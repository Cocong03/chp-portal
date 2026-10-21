import type { ReactNode } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import type { OrderOptionsDto } from '@/api/types'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { SectionCard } from '@/ui/SectionCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { LOADING_TYPES, TIME_WINDOWS, type NewOrderForm } from './form'
import { withAutoLine } from './instructions'
import { SegmentedToggle } from './SegmentedToggle'

const note = 'text-[12.5px] text-muted-foreground'

/** A labelled form row; `hidden` keeps it (and its value) in the form, as the wireframe does. */
function Field({ id, label, hidden, wide, children }: { id: string; label: string; hidden?: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <div hidden={hidden} className={wide ? 'flex flex-col gap-1.5 sm:col-span-2' : 'flex flex-col gap-1.5'}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

/** One select bound to a form field. */
function Choice({ id, name, items, onPicked }: { id: string; name: 'source' | 'timeWindow' | 'loadingType' | 'paymentMethod'; items: { value: string; label: string }[]; onPicked?: () => void }) {
  const { control } = useFormContext<NewOrderForm>()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select
          value={field.value}
          onValueChange={(value) => {
            field.onChange(value)
            onPicked?.()
          }}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  )
}

const asItems = (values: string[]) => values.map((value) => ({ value, label: value }))

/** Delivery & fulfillment (S3-08): pick up vs delivery fields, loading, payment and the instructions' auto line. */
export function FulfillmentCard({ options }: { options: OrderOptionsDto }) {
  const { control, register, getValues, setValue } = useFormContext<NewOrderForm>()
  const [shipmentMethod, paymentMethod] = useWatch({ control, name: ['shipmentMethod', 'paymentMethod'] })
  const pickup = shipmentMethod === 'pickup'
  // Loading type and call-before always reach BC on the instructions' first line (wireframe syncAutoInstructions).
  const syncInstructions = () => setValue('instructions', withAutoLine(getValues('instructions'), getValues('loadingType'), getValues('callBefore')))
  return (
    <SectionCard title="Delivery & fulfillment">
      <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Shipment method</span>
          <Controller
            control={control}
            name="shipmentMethod"
            render={({ field }) => (
              <SegmentedToggle
                label="Shipment method"
                value={field.value}
                options={[
                  { value: 'pickup', label: 'Pick up' },
                  { value: 'delivery', label: 'Delivery' },
                ]}
                onChange={field.onChange}
              />
            )}
          />
        </div>
        <Field id="source-plant" label="Source">
          <Choice id="source-plant" name="source" items={options.plants.map((plant) => ({ value: plant.code, label: `${plant.code} — ${plant.label}` }))} />
          <p className={note}>Choose your preferred source plant.</p>
        </Field>
        <Field id="pickup-date" label="Pick up date" hidden={!pickup}>
          <Input id="pickup-date" type="date" {...register('pickupDate')} />
        </Field>
        <Field id="recv-person" label="Receiving person" hidden={pickup}>
          <Input id="recv-person" placeholder="Name" {...register('receivingPerson')} />
        </Field>
        <Field id="recv-contact" label="Receiving contact number" hidden={pickup}>
          <Input id="recv-contact" placeholder="e.g. 0917 123 4567" {...register('receivingContact')} />
        </Field>
        <Field id="recv-email" label="Receiving email" hidden={pickup}>
          <Input id="recv-email" type="email" placeholder="e.g. logistics@customer.com" {...register('receivingEmail')} />
        </Field>
        <Field id="req-date" label="Requested delivery date" hidden={pickup}>
          <Input id="req-date" type="date" {...register('requestedDate')} />
        </Field>
        <Field id="time-window" label="Receiving time window" hidden={pickup}>
          <Choice id="time-window" name="timeWindow" items={asItems(TIME_WINDOWS)} />
        </Field>
        <Field id="loading-type" label="Loading type">
          <Choice id="loading-type" name="loadingType" items={asItems(LOADING_TYPES)} onPicked={syncInstructions} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" {...register('callBefore', { onChange: syncInstructions })} />
          Call before delivery
        </label>
        <Field id="pay-method" label="Payment method">
          <Choice
            id="pay-method"
            name="paymentMethod"
            items={[
              { value: 'cash', label: 'Cash' },
              { value: 'terms', label: 'Terms' },
            ]}
          />
        </Field>
        {paymentMethod === 'cash' ? (
          <Field id="prepay-terms" label="Prepayment terms">
            <Input id="prepay-terms" readOnly value={options.prepaymentTerms} className="bg-muted" />
          </Field>
        ) : (
          <Field id="pay-terms" label="Payment terms">
            <Input id="pay-terms" readOnly value={options.paymentTerms} className="bg-muted" />
          </Field>
        )}
        <Field id="special-instructions" label="Special delivery instructions" wide>
          <textarea
            id="special-instructions"
            rows={3}
            placeholder="Add anything else after the line above — e.g. narrow access road, use side gate, contact guard on arrival"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            {...register('instructions', { onBlur: syncInstructions })}
          />
        </Field>
      </div>
    </SectionCard>
  )
}
