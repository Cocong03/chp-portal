import { useMemo, useState } from 'react'
import type { SiteDto } from '@/api/types'
import { usePageTitle } from '@/lib/usePageTitle'
import { DataTable, type DataColumn } from '@/ui/DataTable'
import { PageHeader } from '@/ui/PageHeader'
import { QueryError } from '@/ui/QueryError'
import { SearchField } from '@/ui/SearchField'
import { SectionCard } from '@/ui/SectionCard'
import { StatusPill } from '@/ui/StatusPill'
import { Toolbar } from '@/ui/Toolbar'
import { filterSites } from './filterSites'
import { useSites } from './useSites'

const NO_SITES: SiteDto[] = []

// Wireframe Delivery Sites table. The row action ("Request a change") arrives with S4-06.
const columns: DataColumn<SiteDto>[] = [
  {
    id: 'code',
    header: 'Ship-to Address Code',
    cell: ({ row }) => (
      <>
        <span className="font-mono">{row.original.code}</span>
        <br />
        <span className="text-xs text-faint">{row.original.name}</span>
      </>
    ),
  },
  {
    id: 'address',
    header: 'Address',
    cell: ({ row }) => (
      <>
        {row.original.address}
        <br />
        {row.original.city}
      </>
    ),
  },
  { id: 'contact', header: 'Contact', cell: ({ row }) => row.original.contact },
  { id: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone, meta: { className: 'font-mono' } },
  {
    id: 'default',
    header: 'Default',
    cell: ({ row }) => (row.original.isDefault ? <StatusPill tone="good">Default</StatusPill> : null),
  },
]

export function SitesPage() {
  usePageTitle('Delivery Sites')
  const sites = useSites()
  const [query, setQuery] = useState('')
  const all = sites.data ?? NO_SITES
  const shown = useMemo(() => filterSites(all, query), [all, query])

  return (
    <>
      <PageHeader title="Delivery Sites" />
      <SectionCard title="Active Delivery Sites">
        <Toolbar onClear={() => setQuery('')}>
          <SearchField
            label="Search delivery sites"
            placeholder="Search site name, code, or city"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-[280px]"
          />
        </Toolbar>
        {sites.isError ? (
          <QueryError onRetry={() => void sites.refetch()} />
        ) : (
          <>
            <p className="mb-3.5 text-xs text-faint">
              Showing <strong>{shown.length}</strong> delivery sites.
            </p>
            <DataTable
              label="Active delivery sites"
              columns={columns}
              data={shown}
              loading={sites.isPending}
              emptyMessage={
                query.trim() ? 'No delivery sites match your search.' : 'No delivery sites are registered on your account yet.'
              }
              className="shadow-none"
            />
          </>
        )}
      </SectionCard>
    </>
  )
}
