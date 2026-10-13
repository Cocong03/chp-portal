import type { LedgerEntryDto } from '@/api/types'
import { StatusPill } from '@/ui/StatusPill'

/** The wireframe's document type filter. BC may return others; they're shown under BC's name. */
export const LEDGER_TYPES = ['Invoice', 'Credit Memo', 'Payment'] as const

const MANILA = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Today's date in the Philippines (YYYY-MM-DD), whatever the device's time zone. */
export function manilaToday(now = new Date()): string {
  return MANILA.format(now)
}

/** Wireframe isLedgerPastDue: still owed and due before today. A settled or credit entry never counts. */
export function isPastDue(entry: LedgerEntryDto, today: string): boolean {
  return !!entry.dueDate && entry.remaining > 0 && entry.dueDate < today
}

export function LedgerStatusPill({ status }: { status: LedgerEntryDto['status'] }) {
  return <StatusPill tone={status === 'Open' ? 'warn' : 'good'}>{status}</StatusPill>
}
