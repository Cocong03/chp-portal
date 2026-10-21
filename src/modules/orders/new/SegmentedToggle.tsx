import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'

/**
 * The wireframe's `.ordertype-toggle` (Single / Blanket, Pick up / Delivery) as DESIGN.md's ToggleGroup: radio items with
 * arrow-key focus. A single ToggleGroup lets a click clear the choice; these always keep one.
 */
export function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label={label}
      value={value}
      onValueChange={(picked) => {
        if (picked) onChange(picked as T)
      }}
      className="self-start rounded-lg"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} disabled={option.disabled} className="px-3.5 text-[13px] font-semibold">
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
