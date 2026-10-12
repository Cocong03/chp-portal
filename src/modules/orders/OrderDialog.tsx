import { formatDate, peso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSites } from '@/modules/sites/useSites'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog'
import { QueryError } from '@/ui/QueryError'
import { Skeleton } from '@/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'
import { OrderStatusPill, siteLabel, tripNote } from './orderDisplay'
import { useOrder } from './useOrders'

/** The wireframe's View modal: details, BC lines and Order total, Trip ID note. Reorder arrives with New Order (S3). */
export function OrderDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const order = useOrder(id)
  const sites = useSites().data ?? []
  const data = order.data
  const note = data && tripNote(data)

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100vh-40px)] max-w-[720px] overflow-y-auto rounded-2xl p-[22px]">
        <DialogHeader>
          <DialogTitle className="font-mono">{id}</DialogTitle>
          <DialogDescription className="sr-only">Sales order details</DialogDescription>
        </DialogHeader>
        {order.isError ? (
          <QueryError onRetry={() => void order.refetch()} />
        ) : data === null ? (
          <p className="text-[13.5px] text-muted-foreground">We couldn't find this order.</p>
        ) : !data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-x-5 gap-y-2.5 rounded-lg bg-muted px-4 py-3.5 sm:grid-cols-2">
              {(
                [
                  ['Order date', formatDate(data.date)],
                  ['Status', <OrderStatusPill key="s" status={data.status} />],
                  ['PO reference', data.po || '—'],
                  ['Shipment method', data.ship === 'Pickup' ? 'Pick up' : data.ship ?? '—'],
                  ['Delivery site', siteLabel(data.site, sites)],
                  ['Expected delivery date', formatDate(data.edd)],
                  ['Blanket SO #', data.bso ?? '—'],
                  ['Trip ID number', data.trip?.id ?? '—'],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-[11px] font-semibold tracking-wider text-faint uppercase">{label}</dt>
                  <dd className="text-[13.5px]">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="overflow-hidden rounded-xl border">
              <Table aria-label="Order lines">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {['Item', 'Qty', 'UOM', 'Unit price', 'Line total'].map((h, i) => (
                      <TableHead
                        key={h}
                        className={cn('bg-muted text-[11.5px] font-semibold tracking-wider text-faint uppercase', i % 2 && i !== 2 && 'text-right')}
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="py-[26px] text-center text-faint">
                        No items on this order.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.lines.map((line, i) => (
                      <TableRow key={`${line.code}-${i}`}>
                        <TableCell className="whitespace-normal">
                          {line.code} — {line.description}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{line.qty.toLocaleString('en-PH')}</TableCell>
                        <TableCell className="font-mono">{line.uom || '—'}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{peso(line.unitPrice)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{peso(line.lineTotal)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="text-right font-bold">
                      Order total
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold tabular-nums">{peso(data.total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            {note && (
              <p
                className={cn(
                  'rounded-lg px-3.5 py-2.5 text-[13px]',
                  note.tone === 'good' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
                )}
              >
                {note.text}
              </p>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
