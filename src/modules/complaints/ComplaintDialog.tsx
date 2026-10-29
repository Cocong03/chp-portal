import type { ReactNode } from 'react'
import type { ComplaintDto } from '@/api/types'
import { formatDate } from '@/lib/format'
import { ServiceStatusPill } from '@/modules/requests/serviceDisplay'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog'

const LABEL = 'text-[11px] font-semibold tracking-wider text-faint uppercase'

/** Read-only detail of one complaint, taken from the list. */
export function ComplaintDialog({ complaint, onClose }: { complaint: ComplaintDto | null; onClose: () => void }) {
  const rows: [string, ReactNode][] = complaint
    ? [
        ['Status', <ServiceStatusPill key="s" status={complaint.status} />],
        ['Category', complaint.category],
        ['Complaint type', complaint.complaintType],
        ['Assigned group', complaint.assignedGroup || '—'],
        ['Submitted', formatDate(complaint.submitted)],
        ['Date of incident', formatDate(complaint.incidentDate)],
        ['Date resolved', formatDate(complaint.dateResolved)],
        ['Related order', complaint.relatedOrder ? <span key="o" className="font-mono">{complaint.relatedOrder}</span> : '—'],
        ['Delivery site', complaint.deliverySite || '—'],
        ['Preferred contact', `${complaint.contactMethod} — ${complaint.contactValue}`],
        ['Contact person', complaint.contactPerson],
        ['Attachment', complaint.attachmentName || '—'],
      ]
    : []
  return (
    <Dialog open={!!complaint} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100vh-40px)] max-w-[720px] overflow-y-auto rounded-2xl p-[22px]">
        <DialogHeader>
          <DialogTitle className="font-mono">{complaint?.ref}</DialogTitle>
          <DialogDescription className="sr-only">Complaint details</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-1 gap-x-5 gap-y-2.5 rounded-lg bg-muted px-4 py-3.5 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className={LABEL}>{label}</dt>
              <dd className="flex min-h-5 items-center text-[13.5px]">{value}</dd>
            </div>
          ))}
          <div className="flex flex-col gap-0.5 sm:col-span-2">
            <dt className={LABEL}>Subject</dt>
            <dd className="text-[13.5px]">{complaint?.subject}</dd>
          </div>
        </dl>
        <section>
          <h3 className={`mb-1 ${LABEL}`}>Description</h3>
          <p className="text-[13.5px] whitespace-pre-wrap">{complaint?.description}</p>
        </section>
        {complaint?.status === 'Resolved' && (
          <section>
            <h3 className={`mb-1 ${LABEL}`}>Resolution</h3>
            <p className="text-[13.5px] whitespace-pre-wrap">{complaint.resolutionNote}</p>
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
