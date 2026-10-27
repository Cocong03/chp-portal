import type { PortalContactDto } from '@/api/types'
import { canSee } from '@/auth/access'
import { SECTIONS } from '@/layout/sections'
import { usePageTitle } from '@/lib/usePageTitle'
import { DataTable, type DataColumn } from '@/ui/DataTable'
import { PageHeader } from '@/ui/PageHeader'
import { QueryError } from '@/ui/QueryError'
import { SectionCard } from '@/ui/SectionCard'
import { Skeleton } from '@/ui/skeleton'
import { StatusPill } from '@/ui/StatusPill'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip'
import { useCompany } from './useCompany'

const NO_CONTACTS: PortalContactDto[] = []

/** Section labels a web role can open, in nav order (the wireframe's "Can see: …" hint). */
export function canSeeLabels(role: string): string[] {
  return SECTIONS.filter((section) => canSee([role], section.key)).map((section) => section.label)
}

// Wireframe Contacts & Portal Access table. View-only for Nov 15; Revoke arrives with S4-08.
const columns: DataColumn<PortalContactDto>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <>
        {row.original.name}
        {row.original.isYou && <StatusPill className="ml-1.5">You</StatusPill>}
      </>
    ),
  },
  { id: 'title', header: 'Title', cell: ({ row }) => row.original.title },
  { id: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone, meta: { className: 'font-mono' } },
  { id: 'email', header: 'Email', cell: ({ row }) => row.original.email },
  {
    id: 'access',
    header: 'Portal access',
    cell: ({ row }) => (row.original.portalAccess ? <StatusPill tone="good">Yes</StatusPill> : <StatusPill>No</StatusPill>),
  },
  {
    id: 'permissions',
    header: 'Permissions',
    cell: ({ row }) =>
      row.original.portalAccess ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <StatusPill tabIndex={0}>{row.original.portalRole}</StatusPill>
          </TooltipTrigger>
          <TooltipContent>Can see: {canSeeLabels(row.original.portalRole).join(', ')}</TooltipContent>
        </Tooltip>
      ) : (
        '—'
      ),
  },
  { id: 'actions', header: 'Actions', cell: () => '—' },
]

export function AccountPage() {
  usePageTitle('Account and User Management')
  const company = useCompany()
  const data = company.data

  if (company.isError) {
    return (
      <>
        <PageHeader title="Account and User Management" />
        <QueryError onRetry={() => void company.refetch()} />
      </>
    )
  }

  const fields: [string, string | undefined, boolean][] = [
    ['Customer Number', data?.customerNo, true],
    ['Company Name', data?.customerName, false],
    ['Address', data?.address, false],
    ['Website', data?.website, false],
    ['VAT Registration Number', data?.vatRegNumber, true],
  ]

  return (
    <>
      <PageHeader title="Account and User Management" />
      <SectionCard title="Company Information">
        <dl className="grid grid-cols-1 gap-x-5 gap-y-2.5 rounded-lg bg-muted px-4 py-3.5 sm:grid-cols-2">
          {fields.map(([label, value, mono]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-semibold tracking-wider text-faint uppercase">{label}</dt>
              <dd className={mono ? 'font-mono text-[13.5px]' : 'text-[13.5px]'}>
                {data ? value || '—' : <Skeleton className="h-4 w-40" />}
              </dd>
            </div>
          ))}
        </dl>
      </SectionCard>
      <SectionCard title="Contacts & Portal Access">
        <TooltipProvider>
          <DataTable
            label="Contacts and portal access"
            columns={columns}
            data={data?.contacts ?? NO_CONTACTS}
            loading={company.isPending}
            emptyMessage="No contacts are registered on your account yet."
            className="shadow-none"
          />
        </TooltipProvider>
      </SectionCard>
    </>
  )
}
