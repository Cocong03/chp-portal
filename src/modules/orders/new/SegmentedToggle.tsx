import { cn } from '@/lib/utils'

/** The wireframe's `.ordertype-toggle`: a row of radio buttons (Single / Blanket, Pick up / Delivery). */
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
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 self-start rounded-lg border bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-3.5 py-1.5 text-[13px] font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
            value === option.value && 'bg-card text-foreground shadow-sm',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
