import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { OrderSummaryDto, SiteDto } from "@/api/types";
import { formatDate, peso } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";
import { useSites } from "@/modules/sites/useSites";
import { Button } from "@/ui/button";
import { DataTable, type DataColumn } from "@/ui/DataTable";
import { PageHeader } from "@/ui/PageHeader";
import { QueryError } from "@/ui/QueryError";
import { SectionCard } from "@/ui/SectionCard";
import { ManageScheduleDialog } from "./ManageScheduleDialog";
import { OrderDialog } from "./OrderDialog";
import { OrderStatusPill, SiteCell } from "./orderDisplay";
import { useBlanketOrders } from "./useOrders";

const NO_ORDERS: OrderSummaryDto[] = [];
const NO_SITES: SiteDto[] = [];

function columns(sites: SiteDto[], onView: (so: string) => void, onSchedule: (so: string) => void): DataColumn<OrderSummaryDto>[] {
  const mono = { className: "font-mono" };
  return [
    { id: "so", header: "Blanket SO #", cell: ({ row }) => row.original.so, meta: mono },
    { id: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { id: "po", header: "PO reference", cell: ({ row }) => row.original.po || "—", meta: mono },
    { id: "site", header: "Delivery site", cell: ({ row }) => <SiteCell code={row.original.site} sites={sites} /> },
    { id: "total", header: "Total", cell: ({ row }) => peso(row.original.total), meta: { className: "text-right font-mono tabular-nums" } },
    { id: "status", header: "Status", cell: ({ row }) => <OrderStatusPill status={row.original.status} /> },
    {
      id: "actions",
      header: "",
      // Pinned like the Orders list's View, so the actions stay in reach when the table scrolls sideways.
      meta: { className: "sticky right-0" },
      cell: ({ row }) => (
        <div className="flex">
          <Button variant="ghost" size="sm" onClick={() => onView(row.original.so)}>
            View
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onSchedule(row.original.so)}>
            Manage schedule
          </Button>
        </div>
      ),
    },
  ];
}

/** Blanket Orders tab (S3-16), built to the wireframe's `#panel-blanket`: the customer's Blanket Sales Orders from BC. */
export function BlanketOrdersPage() {
  usePageTitle("Blanket Orders");
  const orders = useBlanketOrders();
  const sites = useSites().data ?? NO_SITES;
  const [viewing, setViewing] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const tableColumns = useMemo(() => columns(sites, setViewing, setScheduling), [sites]);
  return (
    <>
      <PageHeader title="Blanket Orders">
        <Button asChild>
          <Link to="/orders/new">+ New Order</Link>
        </Button>
      </PageHeader>
      {saved && (
        <p role="status" className="mb-3.5 text-[13px] font-medium text-success">
          Delivery schedule for {saved} has been updated.
        </p>
      )}
      <SectionCard title="Blanket Orders">
        {orders.isError ? (
          <QueryError onRetry={() => void orders.refetch()} />
        ) : (
          <DataTable
            label="Blanket Orders"
            columns={tableColumns}
            data={orders.data?.orders ?? NO_ORDERS}
            loading={orders.isPending}
            emptyMessage="No Blanket Sales Orders yet."
            className="shadow-none"
          />
        )}
      </SectionCard>
      <OrderDialog
        id={viewing}
        kind="blanket"
        onClose={() => setViewing(null)}
        onManageSchedule={(so) => {
          setViewing(null);
          setScheduling(so);
        }}
      />
      <ManageScheduleDialog so={scheduling} onClose={() => setScheduling(null)} onSaved={setSaved} />
    </>
  );
}
