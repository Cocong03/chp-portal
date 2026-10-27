import type { ServiceStatus } from '@/api/types'
import { StatusPill, type PillTone } from '@/ui/StatusPill'

export const SERVICE_STATUSES: ServiceStatus[] = ['Submitted', 'In Review', 'Resolved']

const TONE: Record<ServiceStatus, PillTone> = { Submitted: 'neutral', 'In Review': 'warn', Resolved: 'good' }

export function ServiceStatusPill({ status }: { status: ServiceStatus }) {
  return <StatusPill tone={TONE[status]}>{status}</StatusPill>
}

/** Distinct assigned groups across the taxonomy, first-seen order. */
export function assignedGroups(taxonomy: { categories: { types: { group: string }[] }[] }): string[] {
  return [...new Set(taxonomy.categories.flatMap((c) => c.types.map((t) => t.group)))]
}
