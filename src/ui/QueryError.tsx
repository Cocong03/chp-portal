import { Button } from '@/ui/button'

export const LOAD_ERROR = "We couldn't load this information. Please try again."

/** Shown in place of data when a read fails. Server Logic only ever returns this safe message anyway. */
export function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-[13.5px] text-destructive"
    >
      <span>{LOAD_ERROR}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
