import { useMemo, useState } from 'react'
import type { RequestDto } from '@/api/types'
import { formatDate } from '@/lib/format'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { DataTable, type DataColumn } from '@/ui/DataTable'
import { PageHeader } from '@/ui/PageHeader'
import { Pager } from '@/ui/Pager'
import { QueryError } from '@/ui/QueryError'
import { SearchField } from '@/ui/SearchField'
import { SectionCard } from '@/ui/SectionCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Toolbar } from '@/ui/Toolbar'
import { RequestDialog } from './RequestDialog'
import { assignedGroups, SERVICE_STATUSES, ServiceStatusPill } from './serviceDisplay'
import { useRequests, useRequestTaxonomy } from './useRequests'

const NO_REQUESTS: RequestDto[] = []
const NO_OPTIONS: string[] = []
const ALL = '__all'
const PAGE_SIZE = 10

function columns(onView: (request: RequestDto) => void): DataColumn<RequestDto>[] {
  return [
    { id: 'submitted', header: 'Submitted', cell: ({ row }) => formatDate(row.original.submitted) },
    { id: 'category', header: 'Category', cell: ({ row }) => row.original.category },
    { id: 'type', header: 'Request Type', cell: ({ row }) => row.original.requestType },
    { id: 'group', header: 'Assigned Group', cell: ({ row }) => row.original.assignedGroup || '—' },
    { id: 'ref', header: 'Reference', cell: ({ row }) => row.original.ref, meta: { className: 'font-mono' } },
    { id: 'details', header: 'Details', cell: ({ row }) => <span className="line-clamp-2 min-w-[200px] whitespace-normal">{row.original.details}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <ServiceStatusPill status={row.original.status} /> },
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

export function RequestsPage() {
  usePageTitle('Requests')
  const requests = useRequests()
  const taxonomy = useRequestTaxonomy().data
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL)
  const [group, setGroup] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<RequestDto | null>(null)
  const all = requests.data ?? NO_REQUESTS
  const categories = useMemo(() => taxonomy?.categories.map((c) => c.name) ?? NO_OPTIONS, [taxonomy])
  const groups = useMemo(() => (taxonomy ? assignedGroups(taxonomy) : NO_OPTIONS), [taxonomy])
  const tableColumns = useMemo(() => columns(setViewing), [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(
      (r) =>
        (category === ALL || r.category === category) &&
        (group === ALL || r.assignedGroup === group) &&
        (status === ALL || r.status === status) &&
        (!q || [r.ref, r.details, ...r.extra.map((e) => e.value)].some((text) => text.toLowerCase().includes(q))),
    )
  }, [all, query, category, group, status])
  const current = Math.min(page, Math.max(1, Math.ceil(shown.length / PAGE_SIZE)))
  const pageRows = useMemo(() => shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), [shown, current])
  const filtered = !!query.trim() || category !== ALL || group !== ALL || status !== ALL

  // Any filter or search change returns to page 1.
  const changing = (set: (value: string) => void) => (value: string) => {
    set(value)
    setPage(1)
  }

  const selects = [
    ['category', 'All categories', category, setCategory, categories],
    ['assigned group', 'All assigned groups', group, setGroup, groups],
    ['status', 'All statuses', status, setStatus, SERVICE_STATUSES],
  ] as const

  return (
    <>
      <PageHeader title="Requests">
        {/* Task 6 adds the dialog and enables this. */}
        <Button disabled>New request</Button>
      </PageHeader>
      <SectionCard title="Requests">
        <Toolbar
          onClear={() => {
            setQuery('')
            setCategory(ALL)
            setGroup(ALL)
            setStatus(ALL)
            setPage(1)
          }}
        >
          <SearchField
            label="Search requests"
            placeholder="Search reference, details, or order"
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
        {requests.isError ? (
          <QueryError onRetry={() => void requests.refetch()} />
        ) : (
          <>
            <p className="mb-3.5 text-xs text-faint">
              Showing <strong>{shown.length}</strong> requests.
            </p>
            <DataTable
              label="Requests"
              columns={tableColumns}
              data={pageRows}
              loading={requests.isPending}
              emptyMessage={filtered ? 'No requests match your filters.' : "You haven't submitted any requests yet."}
              className="shadow-none"
            />
            <Pager page={current} pageSize={PAGE_SIZE} total={shown.length} noun="request" onPage={setPage} />
          </>
        )}
      </SectionCard>
      <RequestDialog request={viewing} onClose={() => setViewing(null)} />
    </>
  )
}
