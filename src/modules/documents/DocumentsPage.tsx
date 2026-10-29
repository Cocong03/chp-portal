import { format, parseISO } from 'date-fns'
import { Download } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { serverLogic } from '@/api/serverLogic'
import type { DocumentDto, DocumentPageDto } from '@/api/types'
import { downloadXlsx } from '@/lib/excel'
import { formatDate, peso } from '@/lib/format'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { DataTable, type DataColumn } from '@/ui/DataTable'
import { DatePicker } from '@/ui/DatePicker'
import { PageHeader } from '@/ui/PageHeader'
import { Pager } from '@/ui/Pager'
import { QueryError } from '@/ui/QueryError'
import { SearchField } from '@/ui/SearchField'
import { SectionCard } from '@/ui/SectionCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Toolbar } from '@/ui/Toolbar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip'
import { downloadDocument } from './downloadDocument'
import { DOCUMENT_TYPES, documentsQuery, useDocuments, type DocumentFilters } from './useDocuments'

const NO_DOCUMENTS: DocumentDto[] = []
const ALL = '__all'
const FILTER_KEYS = ['q', 'type', 'from', 'to', 'page'] as const
const EXPORT_COLUMNS = ['Document type', 'Reference no.', 'Sales order no.', 'PO reference', 'Date', 'Amount']
const mono = { className: 'font-mono' }
const amount = { className: 'text-right font-mono tabular-nums' }
const keyOf = (doc: Pick<DocumentDto, 'type' | 'ref'>) => `${doc.type}|${doc.ref}`

// One spreadsheet row per document: a real date and a numeric Amount (blank for a Delivery Receipt).
function exportRow(doc: DocumentDto) {
  return {
    'Document type': doc.type,
    'Reference no.': doc.ref,
    'Sales order no.': doc.soNo ?? '',
    'PO reference': doc.poRef ?? '',
    Date: parseISO(doc.date),
    Amount: doc.amount,
  }
}

function columns(downloading: Set<string>, onDownload: (doc: DocumentDto) => void): DataColumn<DocumentDto>[] {
  return [
    { id: 'type', header: 'Document type', cell: ({ row }) => row.original.type },
    { id: 'ref', header: 'Reference no.', cell: ({ row }) => row.original.ref, meta: mono },
    { id: 'soNo', header: 'Sales order no.', cell: ({ row }) => row.original.soNo ?? '—', meta: mono },
    { id: 'date', header: 'Date', cell: ({ row }) => formatDate(row.original.date) },
    { id: 'amount', header: 'Amount', cell: ({ row }) => (row.original.amount === null ? '—' : peso(row.original.amount)), meta: amount },
    {
      id: 'download',
      header: '',
      cell: ({ row }) => {
        const busy = downloading.has(keyOf(row.original))
        return (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDownload(row.original)}>
            {busy ? 'Preparing…' : 'Download'}
          </Button>
        )
      },
    },
  ]
}

export function DocumentsPage() {
  usePageTitle('Document Center')
  const [params, setParams] = useSearchParams()
  const filters: DocumentFilters = {
    q: params.get('q') ?? '',
    type: params.get('type') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
  }
  const documents = useDocuments(filters)
  const [search, setSearch] = useState(filters.q)
  const [exporting, setExporting] = useState(false)
  const [downloading, setDownloading] = useState<Set<string>>(new Set())

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

  const data = documents.data
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  // A page past the end (old link, or a filter shrank the list) lands on the last page.
  useEffect(() => {
    if (data && !documents.isPlaceholderData && filters.page > lastPage) update({ page: lastPage > 1 ? String(lastPage) : '' })
  }, [data, filters.page, lastPage, documents.isPlaceholderData])

  async function download(doc: DocumentDto) {
    const key = keyOf(doc)
    setDownloading((current) => new Set(current).add(key))
    try {
      await downloadDocument(doc)
    } catch {
      toast.error("We couldn't download this document. Please try again.")
    } finally {
      setDownloading((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  // Every document matching the filters (all=true), not just this page.
  async function exportDocuments() {
    setExporting(true)
    try {
      const all = await serverLogic<DocumentPageDto>('documents', { query: { ...documentsQuery({ ...filters, page: 1 }), all: 'true' } })
      await downloadXlsx(`Documents-${format(new Date(), 'yyyy-MM-dd')}.xlsx`, 'Documents', EXPORT_COLUMNS, all.documents.map(exportRow))
    } catch {
      toast.error("We couldn't download your documents. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  const tableColumns = useMemo(() => columns(downloading, (doc) => void download(doc)), [downloading])

  return (
    <>
      <PageHeader title="Document Center" />
      <SectionCard title="Document Center">
        <Toolbar
          onClear={() => {
            setSearch('')
            setParams(new URLSearchParams(), { replace: true })
          }}
          actions={
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" onClick={() => void exportDocuments()} disabled={exporting}>
                    <Download aria-hidden />
                    {exporting ? 'Preparing…' : 'CSV / Excel'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Downloads all documents matching your filters.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          }
        >
          <SearchField
            label="Search documents"
            placeholder="Search reference no. or SO no."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-[260px]"
          />
          <Select value={filters.type || ALL} onValueChange={(value) => update({ type: value === ALL ? '' : value })}>
            <SelectTrigger aria-label="Filter by document type" className="w-[210px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All document types</SelectItem>
              {DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DatePicker label="From" value={filters.from} onChange={(from) => update({ from })} />
          <DatePicker label="To" value={filters.to} onChange={(to) => update({ to })} />
        </Toolbar>
        {data && (
          <p className="mb-2.5 text-[12.5px] text-muted-foreground">
            Showing <strong>{data.total}</strong> documents for the current filters.
          </p>
        )}
        {documents.isError ? (
          <QueryError onRetry={() => void documents.refetch()} />
        ) : (
          <>
            <DataTable
              label="Documents"
              columns={tableColumns}
              data={data?.documents ?? NO_DOCUMENTS}
              // Also while jumping back from a page past the end, so the table never says "no documents" next to a count.
              loading={documents.isPending || filters.page > lastPage}
              emptyMessage="No documents match your filters."
              className="shadow-none"
            />
            {data && (
              <Pager
                page={Math.min(filters.page, lastPage)}
                pageSize={data.pageSize}
                total={data.total}
                noun="document"
                onPage={(page) => update({ page: page > 1 ? String(page) : '' })}
              />
            )}
          </>
        )}
      </SectionCard>
    </>
  )
}
