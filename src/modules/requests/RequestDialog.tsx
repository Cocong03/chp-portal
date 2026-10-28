import type { ReactNode } from 'react'
import type { RequestDto } from '@/api/types'
import { formatDate } from '@/lib/format'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog'
import { ServiceStatusPill } from './serviceDisplay'

/** Read-only detail of one request, taken from the list. */
export function RequestDialog({ request, onClose }: { request: RequestDto | null; onClose: () => void }) {
  const rows: [string, ReactNode][] = request
    ? [
        ['Category', request.category],
        ['Request type', request.requestType],
        ['Assigned group', request.assignedGroup || '—'],
        ['Status', <ServiceStatusPill key="s" status={request.status} />],
        ['Submitted', formatDate(request.submitted)],
        ['Preferred contact method', request.contactMethod],
        [request.contactMethod === 'Email' ? 'Email address' : 'Mobile number', request.contactValue],
        ['Contact person', request.contactPerson],
        ['Attachment', request.attachmentName || '—'],
        ...request.extra.map((e): [string, ReactNode] => [e.label, e.value]),
      ]
    : []
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100vh-40px)] max-w-[720px] overflow-y-auto rounded-2xl p-[22px]">
        <DialogHeader>
          <DialogTitle className="font-mono">{request?.ref}</DialogTitle>
          <DialogDescription className="sr-only">Request details</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-1 gap-x-5 gap-y-2.5 rounded-lg bg-muted px-4 py-3.5 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-semibold tracking-wider text-faint uppercase">{label}</dt>
              <dd className="flex min-h-5 items-center text-[13.5px]">{value}</dd>
            </div>
          ))}
        </dl>
        <section>
          <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">Request details</h3>
          <p className="text-[13.5px] whitespace-pre-wrap">{request?.details}</p>
        </section>
        {request?.additionalInfo && (
          <section>
            <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">Additional information</h3>
            <p className="text-[13.5px] whitespace-pre-wrap">{request.additionalInfo}</p>
          </section>
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
