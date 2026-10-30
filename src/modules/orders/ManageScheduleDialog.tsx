import { useState } from "react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";
import { QueryError } from "@/ui/QueryError";
import { Skeleton } from "@/ui/skeleton";
import { newScheduleRow, scheduleSummary, type ScheduleItem, type ScheduleRow } from "./schedule";
import { ScheduleEditor } from "./ScheduleEditor";
import { useOrder } from "./useOrders";

const NO_ITEMS: ScheduleItem[] = [];

/**
 * The wireframe's Manage schedule modal for a placed Blanket Sales Order (S3-16). Planning only for now (spec decision 3):
 * Save schedule sends and stores nothing, so the dialog opens with one empty row every time.
 */
export function ManageScheduleDialog({ so, onClose, onSaved }: { so: string | null; onClose: () => void; onSaved: (so: string) => void }) {
  return (
    <Dialog open={!!so} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100vh-40px)] overflow-y-auto sm:max-w-[720px] rounded-2xl p-[22px]">
        <DialogHeader>
          <DialogTitle>Delivery schedule — {so}</DialogTitle>
          <DialogDescription>
            Add or adjust when each item ships against this Blanket Order, any time. Saving, routes the update to our Customer Service team to confirm
            the scheduling. The total scheduled per item can never exceed what is on this Blanket Order.
          </DialogDescription>
        </DialogHeader>
        {/* Keyed by BSO: a different order (or reopening) starts a fresh schedule. */}
        {so && <ScheduleForm key={so} so={so} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({ so, onClose, onSaved }: { so: string; onClose: () => void; onSaved: (so: string) => void }) {
  const order = useOrder(so, "blanket");
  // BC's charge lines (SERV000001 Freight, SERV000002 Fuel Surcharge) show in View but aren't products to schedule.
  const ordered =
    order.data?.lines.filter((line) => !line.code.startsWith("SERV")).map(({ code, description, qty }) => ({ code, description, qty })) ?? NO_ITEMS;
  // Seeded once the lines arrive: one row on the first item, as the wireframe opens it.
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const current = rows ?? (order.data ? (ordered.length ? [newScheduleRow(ordered)] : []) : null);
  const over = current !== null && scheduleSummary(ordered, current).some((each) => each.over);

  if (order.isError) return <QueryError onRetry={() => void order.refetch()} />;
  if (order.data === null) return <p className="text-[13.5px] text-muted-foreground">We couldn't find this order.</p>;
  return (
    <>
      {current === null ? (
        <Skeleton className="h-32" />
      ) : (
        <ScheduleEditor ordered={ordered} rows={current} onChange={setRows} overHint="above" emptyMessage="No items on this Blanket Order." />
      )}
      {over && (
        <p className="text-[12.5px] font-medium text-destructive">
          One or more items exceed the quantity in the Blanket Sales Order. Please adjust the quantity before saving.
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={current === null || ordered.length === 0 || over}
          onClick={() => {
            onSaved(so);
            onClose();
          }}
        >
          Save schedule
        </Button>
      </DialogFooter>
    </>
  );
}
