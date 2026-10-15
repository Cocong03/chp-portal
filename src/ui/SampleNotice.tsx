/** Marks a screen or section that shows sample figures until BC provides the real ones. */
export function SampleNotice({ className }: { className?: string }) {
  return (
    <p role="note" className={`rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-foreground ${className ?? ''}`}>
      <strong>Sample data</strong> — for preview only. Your account's figures will appear here once they're available.
    </p>
  )
}
