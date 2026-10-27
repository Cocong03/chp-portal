import type { OrderStatus, OrderSummaryDto, SiteDto } from "@/api/types";
import { formatDate } from "@/lib/format";
import { StatusPill, type PillTone } from "@/ui/StatusPill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/tooltip";

export const ORDER_STATUSES: OrderStatus[] = [
  "Open",
  "Pending Prepayment",
  "Ready for Dispatch",
  "Completely Shipped",
  "Invoiced",
];

// DESIGN.md §6 sales-order colours.
const TONE: Record<OrderStatus, PillTone> = {
  Open: "neutral",
  "Pending Prepayment": "warn",
  "Ready for Dispatch": "progress",
  "Completely Shipped": "good",
  Invoiced: "good",
};

export function OrderStatusPill({ status }: { status: OrderStatus | null }) {
  return status ? (
    <StatusPill tone={TONE[status]}>{status}</StatusPill>
  ) : (
    <>—</>
  );
}

/** Wireframe `.ship-badge`: P / D circle; the full word is its accessible name and tooltip. */
export function ShipBadge({ ship }: { ship: OrderSummaryDto["ship"] }) {
  if (!ship) return <>—</>;
  const word = ship === "Pickup" ? "Pick up" : "Delivery";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={word}
            tabIndex={0}
            className="inline-flex size-[22px] items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground"
          >
            {ship[0]}
          </span>
        </TooltipTrigger>
        <TooltipContent>{word}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The Order view's Trip ID note (mockup copy). None while BC doesn't say whether it's Pick up or Delivery. */
export function tripNote({
  ship,
  trip,
}: Pick<OrderSummaryDto, "ship" | "trip">): {
  tone: "good" | "warn";
  text: string;
} | null {
  if (trip?.id) {
    const when = trip.assignedAt ? ` on ${formatDate(trip.assignedAt)}` : "";
    const gate =
      ship === "Pickup"
        ? " This is your basis for entry at the plant gate."
        : "";
    return { tone: "good", text: `Trip ID ${trip.id} assigned${when}.${gate}` };
  }
  if (ship === "Pickup")
    return {
      tone: "warn",
      text: "No Trip ID number yet — this order can't be picked up at the plant until one is assigned.",
    };
  if (ship === "Delivery")
    return {
      tone: "warn",
      text: "No Trip ID number yet — assigned once this delivery is scheduled.",
    };
  return null;
}

export function siteLabel(
  code: string,
  sites: Pick<SiteDto, "code" | "name">[],
): string {
  if (!code) return "—";
  const site = sites.find((s) => s.code === code);
  return site ? `${code} — ${site.name}` : code;
}

/** The lists' Delivery site cell: the ship-to code, its name underneath once sites load; "—" without a code. */
export function SiteCell({ code, sites }: { code: string; sites: SiteDto[] }) {
  if (!code) return "—";
  const site = sites.find((s) => s.code === code);
  return (
    <>
      <span className="font-mono">{code}</span>
      {site && (
        <>
          <br />
          <span className="text-xs text-faint">{site.name}</span>
        </>
      )}
    </>
  );
}
