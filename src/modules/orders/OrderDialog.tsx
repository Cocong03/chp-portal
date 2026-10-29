import type { OrderKind } from "@/api/types";
import { formatDate, peso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSites } from "@/modules/sites/useSites";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { QueryError } from "@/ui/QueryError";
import { Skeleton } from "@/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui/table";
import { OrderStatusPill, siteLabel, tripNote } from "./orderDisplay";
import { useOrder } from "./useOrders";

/**
 * The wireframe's View modal: details, BC lines and Order total, Trip ID note. A Blanket Sales Order (S3-16) has no Trip ID
 * note, its Blanket SO # is "—" (it is the BSO), and its footer offers Manage schedule.
 */
export function OrderDialog({
  id,
  onClose,
  kind = "order",
  onManageSchedule,
}: {
  id: string | null;
  onClose: () => void;
  kind?: OrderKind;
  onManageSchedule?: (so: string) => void;
}) {
  const blanket = kind === "blanket";
  const order = useOrder(id, kind);
  const sites = useSites().data ?? [];
  const data = order.data;
  const note = data && !blanket && tripNote(data);
  // BC leaves blanket lines unpriced (₱0, probed 2026-10-27): "—", never a price the customer didn't agree to.
  const unpriced = (line: { unitPrice: number }) => blanket && line.unitPrice === 0;
  /** While the order loads, each value is a bar the size of what it stands in for, so the layout doesn't jump. */
  const bone = (width = "w-24") => <Skeleton className={cn("h-4", width)} />;

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100vh-40px)] overflow-y-auto sm:max-w-[720px] rounded-2xl p-[22px]">
        <DialogHeader>
          <DialogTitle className="font-mono">{id}</DialogTitle>
          <DialogDescription className="sr-only">{blanket ? "Blanket sales order details" : "Sales order details"}</DialogDescription>
        </DialogHeader>
        {order.isError ? (
          <QueryError onRetry={() => void order.refetch()} />
        ) : data === null ? (
          <p className="text-[13.5px] text-muted-foreground">We couldn't find this order.</p>
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-x-5 gap-y-2.5 rounded-lg bg-muted px-4 py-3.5 sm:grid-cols-2">
              {(
                [
                  ["Order date", data ? formatDate(data.date) : bone()],
                  ["Status", data ? <OrderStatusPill key="s" status={data.status} /> : bone("w-20")],
                  ["PO reference", data ? data.po || "—" : bone("w-16")],
                  ["Shipment method", data ? (data.ship === "Pickup" ? "Pick up" : (data.ship ?? "—")) : bone("w-16")],
                  ["Delivery site", data ? siteLabel(data.site, sites) : bone("w-44")],
                  ["Expected delivery date", data ? formatDate(data.edd) : bone()],
                  ["Blanket SO #", data ? ((!blanket && data.bso) || "—") : bone("w-28")],
                  ["Trip ID number", data ? (data.trip?.id ?? "—") : bone("w-20")],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-[11px] font-semibold tracking-wider text-faint uppercase">{label}</dt>
                  <dd className="flex min-h-5 items-center text-[13.5px]">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="overflow-hidden rounded-xl border">
              <Table aria-label="Order lines">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {["Item", "Qty", "UOM", "Unit price", "Line total"].map((h, i) => (
                      <TableHead key={h} className={cn("bg-muted text-[11.5px] font-semibold tracking-wider text-faint uppercase", i % 2 && i !== 2 && "text-right")}>
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!data ? (
                    [0, 1].map((i) => (
                      <TableRow key={i} className="hover:bg-transparent">
                        <TableCell>{bone("w-48")}</TableCell>
                        {["w-8", "w-12", "w-16", "w-20"].map((width, j) => (
                          <TableCell key={j}>
                            <div className={cn("flex", j !== 1 && "justify-end")}>{bone(width)}</div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data.lines.length === 0 ? (
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
                        <TableCell className="text-right font-mono tabular-nums">{line.qty.toLocaleString("en-PH")}</TableCell>
                        <TableCell className="font-mono">{line.uom || "—"}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{unpriced(line) ? "—" : peso(line.unitPrice)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{unpriced(line) ? "—" : peso(line.lineTotal)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="text-right font-bold">
                      Order total
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold tabular-nums">{data ? (blanket && data.total === 0 ? "—" : peso(data.total)) : <div className="flex justify-end">{bone("w-24")}</div>}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            {note && <p className={cn("rounded-lg px-3.5 py-2.5 text-[13px]", note.tone === "good" ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{note.text}</p>}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {onManageSchedule && id && <Button onClick={() => onManageSchedule(id)}>Manage schedule</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
