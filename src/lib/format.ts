import { format, isValid, parseISO } from 'date-fns'

const PESO = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** ₱1,234.00; negatives as -₱1,234.00 (DESIGN.md, the way BC shows credits). Display only — amounts come from BC. */
export function peso(value: number): string {
  return (value < 0 ? '-₱' : '₱') + PESO.format(Math.abs(value))
}

/** Oct 9, 2026. "—" for an empty value, BC's 0001-01-01 "no date", or anything unparseable. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso || iso === '0001-01-01') return '—'
  const date = parseISO(iso)
  return isValid(date) ? format(date, 'MMM d, yyyy') : '—'
}
