import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { LedgerEntryDto } from '@/api/types'
import { formatDate, peso } from '@/lib/format'
import { usePageTitle } from '@/lib/usePageTitle'
import { cn } from '@/lib/utils'
import { DataTable, type DataColumn } from '@/ui/DataTable'
import { DatePicker } from '@/ui/DatePicker'
import { PageHeader } from '@/ui/PageHeader'
import { Pager } from '@/ui/Pager'
import { QueryError } from '@/ui/QueryError'
import { SearchField } from '@/ui/SearchField'
import { SectionCard } from '@/ui/SectionCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Toolbar } from '@/ui/Toolbar'
import { isPastDue, LEDGER_TYPES, LedgerStatusPill, manilaToday } from './ledgerDisplay'
import { useLedger, type LedgerFilters } from './useLedger'

const NO_ENTRIES: LedgerEntryDto[] = []
const ALL = '__all'
const OPEN = '__open'
const FILTER_KEYS = ['q', 'type', 'show', 'from', 'to', 'page'] as const
const mono = { className: 'font-mono' }
const amount = { className: 'text-right font-mono tabular-nums' }

function columns(today: string): DataColumn<LedgerEntryDto>[] {
  return [
    { id: 'postingDate', header: 'Posting date', cell: ({ row }) => formatDate(row.original.postingDate) },
    { id: 'type', header: 'Document type', cell: ({ row }) => row.original.type },
    { id: 'docNo', header: 'Document no.', cell: ({ row }) => row.original.docNo, meta: mono },
    { id: 'refPo', header: 'Ref PO Number', cell: ({ row }) => row.original.refPo ?? '—', meta: mono },
    { id: 'desc', header: 'Description', cell: ({ row }) => row.original.desc },
    {
      id: 'dueDate',
      header: 'Due date',
      cell: ({ row }) => (
        <span className={cn(isPastDue(row.original, today) && 'font-semibold text-destructive')}>{formatDate(row.original.dueDate)}</span>
      ),
    },
    { id: 'original', header: 'Original amount', cell: ({ row }) => peso(row.original.original), meta: amount },
    { id: 'remaining', header: 'Remaining amount', cell: ({ row }) => peso(row.original.remaining), meta: amount },
    { id: 'status', header: 'Status', cell: ({ row }) => <LedgerStatusPill status={row.original.status} /> },
  ]
}

export function LedgerPage() {
  usePageTitle('Customer Ledger')
  const [params, setParams] = useSearchParams()
  const filters: LedgerFilters = {
    q: params.get('q') ?? '',
    type: params.get('type') ?? '',
    show: params.get('show') === 'all' ? 'all' : '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
  }
  const ledger = useLedger(filters)
  const [search, setSearch] = useState(filters.q)

  function update(changes: Partial<Record<(typeof FILTER_KEYS)[number], string>>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        if (!('page' in changes)) next.delete('page') // any filter change starts again at page 1
        return next
      },
      { replace: true },
    )
  }

  // Search waits for typing to stop (~300 ms) so not every keystroke calls BC.
  useEffect(() => {
    if (search.trim() === filters.q) return
    const timer = window.setTimeout(() => update({ q: search.trim() }), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const data = ledger.data
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  // A page past the end (old link, or a filter shrank the list) lands on the last page.
  useEffect(() => {
    if (data && !ledger.isPlaceholderData && filters.page > lastPage) update({ page: lastPage > 1 ? String(lastPage) : '' })
  }, [data, filters.page, lastPage, ledger.isPlaceholderData])

  const today = manilaToday()

  return (
    <>
      <PageHeader title="Customer Ledger" />
      <SectionCard title="Customer Ledger">
        <Toolbar
          onClear={() => {
            setSearch('')
            setParams(new URLSearchParams(), { replace: true })
          }}
        >
          <SearchField
            label="Search ledger entries"
            placeholder="Search document no., Ref PO, or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-[260px]"
          />
          <Select value={filters.type || ALL} onValueChange={(value) => update({ type: value === ALL ? '' : value })}>
            <SelectTrigger aria-label="Filter by document type" className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All document types</SelectItem>
              {LEDGER_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.show || OPEN} onValueChange={(value) => update({ show: value === OPEN ? '' : value })}>
            <SelectTrigger aria-label="Show open items or all entries" className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OPEN}>Open items only</SelectItem>
              <SelectItem value="all">All entries</SelectItem>
            </SelectContent>
          </Select>
          <DatePicker label="From" value={filters.from} onChange={(from) => update({ from })} />
          <DatePicker label="To" value={filters.to} onChange={(to) => update({ to })} />
        </Toolbar>
        {ledger.isError ? (
          <QueryError onRetry={() => void ledger.refetch()} />
        ) : (
          <>
            <DataTable
              label="Customer ledger"
              columns={columns(today)}
              data={data?.entries ?? NO_ENTRIES}
              // Also while jumping back from a page past the end, so the table never says "no entries" next to a count.
              loading={ledger.isPending || filters.page > lastPage}
              emptyMessage="No entries match your filters."
              className="shadow-none"
            />
            {data && (
              <Pager
                page={Math.min(filters.page, lastPage)}
                pageSize={data.pageSize}
                total={data.total}
                noun="entry"
                plural="entries"
                onPage={(page) => update({ page: page > 1 ? String(page) : '' })}
              />
            )}
          </>
        )}
      </SectionCard>
    </>
  )
}
