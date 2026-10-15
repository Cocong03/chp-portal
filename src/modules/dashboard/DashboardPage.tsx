import type { ReactNode } from 'react'
import type { DashboardDto } from '@/api/types'
import { canSee } from '@/auth/access'
import { useMe } from '@/auth/useMe'
import { peso } from '@/lib/format'
import { usePageTitle } from '@/lib/usePageTitle'
import { SAMPLE_ACCOUNT } from '@/mocks/dashboard'
import { PageHeader } from '@/ui/PageHeader'
import { QueryError } from '@/ui/QueryError'
import { Skeleton } from '@/ui/skeleton'
import { AnnouncementBanner } from './AnnouncementBanner'
import { Greeting } from './Greeting'
import { StatTile, type TileTone } from './StatTile'
import { useDashboard } from './useDashboard'

const GRID = 'grid grid-cols-2 gap-3.5 md:grid-cols-5'
const NO_ROLES: string[] = []
const ORDER_TILES: { key: keyof DashboardDto['counts']; label: string; status: string; tone: TileTone }[] = [
  { key: 'open', label: 'Open', status: 'Open', tone: 'neutral' },
  { key: 'pendingPrepayment', label: 'Pending prepayment', status: 'Pending Prepayment', tone: 'warn' },
  { key: 'readyForDispatch', label: 'Ready for dispatch', status: 'Ready for Dispatch', tone: 'progress' },
  { key: 'completelyShipped', label: 'Completely shipped', status: 'Completely Shipped', tone: 'clear' },
  { key: 'invoiced', label: 'Invoiced', status: 'Invoiced', tone: 'clear' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `dashboard-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section aria-labelledby={id} className="mb-[30px]">
      <h2 id={id} className="mb-3.5 text-[19px] font-bold">
        {title}
      </h2>
      <div className={GRID}>{children}</div>
    </section>
  )
}

export function DashboardPage() {
  usePageTitle('Dashboard')
  const dashboard = useDashboard()
  const roles = useMe().data?.roles ?? NO_ROLES
  const canOpenOrders = canSee(roles, 'orders')
  const data = dashboard.data
  const money = (value: number | null | undefined) => (data ? (value == null ? '—' : peso(value)) : <Skeleton className="h-7 w-32" />)
  // ponytail: sample balances until BC has them (S2-07) and available credit (S2-09); then data?.account.
  const account = data && SAMPLE_ACCOUNT
  const overdue = account?.overdue ?? null
  const overdueTone: TileTone = overdue == null ? 'neutral' : overdue > 0 ? 'alert' : 'clear'
  const overdueCaption =
    overdueTone === 'alert'
      ? 'Past its due date — please settle to avoid delivery holds'
      : overdueTone === 'clear'
        ? 'Nothing past due — account in good standing'
        : 'Past its due date'

  return (
    <>
      <PageHeader title="Dashboard" />
      <Greeting />
      <AnnouncementBanner />
      {dashboard.isError ? (
        <QueryError onRetry={() => void dashboard.refetch()} />
      ) : (
        <>
          <Section title="Account overview">
            <StatTile label="Outstanding Balance" value={money(account?.balance)} caption="Total outstanding on your account" />
            <StatTile label="Balance Due Today" value={money(account?.balanceDue)} caption="Due now per your payment terms" />
            <StatTile label="Overdue amount" value={money(account ? overdue : undefined)} caption={overdueCaption} tone={overdueTone} />
            <StatTile label="Credit limit" value={money(account?.creditLimit)} caption="Set on your customer record" />
            <StatTile label="Available credit" value={money(account?.availableCredit)} caption="Kept in sync with your live credit standing" />
          </Section>
          <Section title="Sales Orders">
            {ORDER_TILES.map((tile) => {
              const count = data?.counts[tile.key]
              const link = canOpenOrders && count != null
              return (
                <StatTile
                  key={tile.key}
                  label={tile.label}
                  tone={tile.tone}
                  value={data ? (count == null ? '—' : count.toLocaleString('en-PH')) : <Skeleton className="h-7 w-12" />}
                  caption={link ? 'View these orders →' : undefined}
                  to={link ? `/orders?status=${encodeURIComponent(tile.status)}` : undefined}
                />
              )
            })}
          </Section>
        </>
      )}
    </>
  )
}
