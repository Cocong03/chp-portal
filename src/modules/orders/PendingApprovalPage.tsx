import { useLocation } from 'react-router-dom'
import type { PendingOrderDto } from '@/api/types'
import { formatDate, peso } from '@/lib/format'
import { usePageTitle } from '@/lib/usePageTitle'
import { useSites } from '@/modules/sites/useSites'
import { PageHeader } from '@/ui/PageHeader'
import { QueryError } from '@/ui/QueryError'
import { SectionCard } from '@/ui/SectionCard'
import { Skeleton } from '@/ui/skeleton'
import { StatusPill } from '@/ui/StatusPill'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'
import { SiteCell } from './orderDisplay'
import { usePendingOrders } from './useOrders'

const TONE: Record<PendingOrderDto['status'], 'warn' | 'bad'> = { 'Awaiting credit approval': 'warn', Declined: 'bad' }

/** Pending Approval tab (S3-11), built to the wireframe's `#panel-pending`: credit orders held for the credit team, or declined. */
export function PendingApprovalPage() {
  usePageTitle('Pending Approval')
  const orders = usePendingOrders()
  const sites = useSites().data ?? []
  const sentForReview = (useLocation().state as { sentForReview?: boolean } | null)?.sentForReview

  return (
    <>
      <PageHeader title="Pending Approval" />
      {sentForReview && (
        <p role="status" className="mb-3.5 text-[12.5px] font-semibold text-success">
          Your order was sent to our credit team for review.
        </p>
      )}
      <SectionCard title="Pending Approval">
        {orders.isError && !orders.data ? (
          <QueryError onRetry={() => void orders.refetch()} />
        ) : !orders.data ? (
          <div role="status" className="flex flex-col gap-2">
            <span className="sr-only">Loading…</span>
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : (
          <Table aria-label="Pending Approval">
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>PO reference</TableHead>
                <TableHead>Delivery site</TableHead>
                <TableHead className="text-right">Estimated total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Why it needs review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    No orders are waiting for approval.
                  </TableCell>
                </TableRow>
              ) : (
                orders.data.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>{formatDate(order.submitted)}</TableCell>
                    <TableCell>{order.po || '—'}</TableCell>
                    <TableCell>
                      <SiteCell code={order.site} sites={sites} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{peso(order.est)}</TableCell>
                    <TableCell>
                      <StatusPill tone={TONE[order.status]}>{order.status}</StatusPill>
                    </TableCell>
                    <TableCell>
                      {order.reason}
                      {order.comment && (
                        <>
                          <br />
                          <span className="text-xs text-muted-foreground">Credit team: {order.comment}</span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </>
  )
}
