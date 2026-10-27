import { useMemo, useState } from 'react'
import type { ComplaintDto } from '@/api/types'
import { formatDate } from '@/lib/format'
import { usePageTitle } from '@/lib/usePageTitle'
import { assignedGroups, PAGE_SIZE, SERVICE_STATUSES, ServiceStatusPill } from '@/modules/requests/serviceDisplay'
import { Button } from '@/ui/button'
import { DataTable, type DataColumn } from '@/ui/DataTable'
import { PageHeader } from '@/ui/PageHeader'
import { Pager } from '@/ui/Pager'
import { QueryError } from '@/ui/QueryError'
import { SearchField } from '@/ui/SearchField'
import { SectionCard } from '@/ui/SectionCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Toolbar } from '@/ui/Toolbar'
import { ComplaintDialog } from './ComplaintDialog'
import { NewComplaintDialog } from './NewComplaintDialog'
import { useComplaints, useComplaintTaxonomy } from './useComplaints'

const NO_COMPLAINTS: ComplaintDto[] = []
const NO_OPTIONS: string[] = []
const ALL = '__all'

function columns(onView: (complaint: ComplaintDto) => void): DataColumn<ComplaintDto>[] {
  return [
    { id: 'submitted', header: 'Submitted', cell: ({ row }) => formatDate(row.original.submitted) },
    { id: 'type', header: 'Complaint Type', cell: ({ row }) => row.original.complaintType },
    { id: 'group', header: 'Assigned Group', cell: ({ row }) => row.original.assignedGroup || '—' },
    { id: 'ref', header: 'Reference', cell: ({ row }) => row.original.ref, meta: { className: 'font-mono' } },
    { id: 'subject', header: 'Subject', cell: ({ row }) => <span className="line-clamp-2 min-w-[200px] whitespace-normal">{row.original.subject}</span> },
    { id: 'order', header: 'Related order', cell: ({ row }) => row.original.relatedOrder || '—', meta: { className: 'font-mono' } },
    { id: 'status', header: 'Status', cell: ({ row }) => <ServiceStatusPill status={row.original.status} /> },
    { id: 'resolved', header: 'Date Resolved', cell: ({ row }) => formatDate(row.original.dateResolved) },
    {
      id: 'view',
      header: '',
      // Pinned: the table scrolls sideways on narrower screens and View must stay in reach.
      meta: { className: 'sticky right-0' },
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => onView(row.original)}>
          View
        </Button>
      ),
    },
  ]
}

export function ComplaintsPage() {
  usePageTitle('Complaints & Feedback')
  const complaints = useComplaints()
  const taxonomy = useComplaintTaxonomy().data
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<ComplaintDto | null>(null)
  const [creating, setCreating] = useState(false)
  const all = complaints.data ?? NO_COMPLAINTS
  const groups = useMemo(() => (taxonomy ? assignedGroups(taxonomy) : NO_OPTIONS), [taxonomy])
  const tableColumns = useMemo(() => columns(setViewing), [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(
      (c) =>
        (group === ALL || c.assignedGroup === group) &&
        (status === ALL || c.status === status) &&
        (!q || [c.ref, c.subject, c.relatedOrder].some((text) => text.toLowerCase().includes(q))),
    )
  }, [all, query, group, status])
  const current = Math.min(page, Math.max(1, Math.ceil(shown.length / PAGE_SIZE)))
  const pageRows = useMemo(() => shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), [shown, current])
  const filtered = !!query.trim() || group !== ALL || status !== ALL

  // Any filter or search change returns to page 1.
  const changing = (set: (value: string) => void) => (value: string) => {
    set(value)
    setPage(1)
  }

  const selects = [
    ['assigned group', 'All assigned groups', group, setGroup, groups],
    ['status', 'All statuses', status, setStatus, SERVICE_STATUSES],
  ] as const

  return (
    <>
      <PageHeader title="Complaints & Feedback">
        <Button onClick={() => setCreating(true)}>New complaint</Button>
      </PageHeader>
      <SectionCard title="Complaints">
        <Toolbar
          onClear={() => {
            setQuery('')
            setGroup(ALL)
            setStatus(ALL)
            setPage(1)
          }}
        >
          <SearchField
            label="Search complaints"
            placeholder="Search reference, subject, or order"
            value={query}
            onChange={(event) => changing(setQuery)(event.target.value)}
            className="max-w-[280px]"
          />
          {selects.map(([name, allLabel, value, set, options]) => (
            <Select key={name} value={value} onValueChange={changing(set)}>
              <SelectTrigger aria-label={`Filter by ${name}`} className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{allLabel}</SelectItem>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </Toolbar>
        {complaints.isError ? (
          <QueryError onRetry={() => void complaints.refetch()} />
        ) : (
          <>
            <p className="mb-3.5 text-xs text-faint">
              Showing <strong>{shown.length}</strong> complaints.
            </p>
            <DataTable
              label="Complaints"
              columns={tableColumns}
              data={pageRows}
              loading={complaints.isPending}
              emptyMessage={filtered ? 'No complaints match your filters.' : "You haven't submitted any complaints yet."}
              className="shadow-none"
            />
            <Pager page={current} pageSize={PAGE_SIZE} total={shown.length} noun="complaint" onPage={setPage} />
          </>
        )}
      </SectionCard>
      <ComplaintDialog complaint={viewing} onClose={() => setViewing(null)} />
      {creating && <NewComplaintDialog open onClose={() => setCreating(false)} />}
    </>
  )
}
