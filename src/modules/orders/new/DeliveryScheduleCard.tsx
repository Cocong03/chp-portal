import { Controller, useFormContext, useWatch } from 'react-hook-form'
import type { OrderOptionsDto } from '@/api/types'
import { SectionCard } from '@/ui/SectionCard'
import type { ScheduleItem } from '../schedule'
import { ScheduleEditor } from '../ScheduleEditor'
import type { NewOrderForm } from './form'

/** The order lines a Blanket Order's schedule plans against: lines with a known item, with their typed quantity. */
export function scheduleItems(lines: NewOrderForm['lines'], items: OrderOptionsDto['items']): ScheduleItem[] {
  return (lines ?? []).flatMap((line) => {
    const item = items.find((each) => each.code === line.code)
    return item ? [{ code: item.code, description: item.description, qty: Number(line.qty) || 0 }] : []
  })
}

/** The wireframe's `#blanket-schedule-card` (S3-16): Blanket Order only, planning only (never sent, saved with drafts). */
export function DeliveryScheduleCard({ options }: { options: OrderOptionsDto }) {
  const { control } = useFormContext<NewOrderForm>()
  const [lines, orderType] = useWatch({ control, name: ['lines', 'orderType'] })
  if (orderType !== 'blanket') return null
  return (
    <SectionCard title="Delivery schedule">
      <Controller
        control={control}
        name="schedule"
        render={({ field }) => (
          <ScheduleEditor
            ordered={scheduleItems(lines, options.items)}
            rows={field.value}
            onChange={field.onChange}
            overHint="below"
            emptyMessage="Add order lines above to schedule deliveries against them."
          />
        )}
      />
    </SectionCard>
  )
}
