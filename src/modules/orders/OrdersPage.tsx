import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { OrderSummaryDto, SiteDto } from "@/api/types";
import { formatDate, peso } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";
import { useSites } from "@/modules/sites/useSites";
import { Button } from "@/ui/button";
import { DataTable, type DataColumn } from "@/ui/DataTable";
import { DatePicker } from "@/ui/DatePicker";
import { PageHeader } from "@/ui/PageHeader";
import { Pager } from "@/ui/Pager";
import { QueryError } from "@/ui/QueryError";
import { SearchField } from "@/ui/SearchField";
import { SectionCard } from "@/ui/SectionCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Toolbar } from "@/ui/Toolbar";
import { TooltipProvider } from "@/ui/tooltip";
import { OrderDialog } from "./OrderDialog";
import { ORDER_STATUSES, OrderStatusPill, ShipBadge } from "./orderDisplay";
import { useOrders, type OrderFilters } from "./useOrders";

const NO_ORDERS: OrderSummaryDto[] = [];
const NO_SITES: SiteDto[] = [];
const ALL = "__all";
const FILTER_KEYS = ["q", "status", "site", "from", "to", "page"] as const;

function columns(sites: SiteDto[], onView: (so: string) => void): DataColumn<OrderSummaryDto>[] {
  const mono = { className: "font-mono" };
  return [
    { id: "so", header: "Sales Order #", cell: ({ row }) => row.original.so, meta: mono },
    { id: "date", header: "Order date", cell: ({ row }) => formatDate(row.original.date) },
    { id: "po", header: "PO reference", cell: ({ row }) => row.original.po || "—", meta: mono },
    {
      id: "site",
      header: "Delivery site",
      cell: ({ row }) => {
        const site = sites.find((s) => s.code === row.original.site);
        return row.original.site ? (
          <>
            <span className="font-mono">{row.original.site}</span>
            {site && (
              <>
                <br />
                <span className="text-xs text-faint">{site.name}</span>
              </>
            )}
          </>
        ) : (
          "—"
        );
      },
    },
    { id: "ship", header: "Ship", cell: ({ row }) => <ShipBadge ship={row.original.ship} /> },
    { id: "bso", header: "Blanket SO #", cell: ({ row }) => row.original.bso ?? "—", meta: mono },
    { id: "trip", header: "Trip ID", cell: ({ row }) => row.original.trip?.id ?? "—", meta: mono },
    { id: "edd", header: "Expected delivery", cell: ({ row }) => formatDate(row.original.edd) },
    { id: "total", header: "Total", cell: ({ row }) => peso(row.original.total), meta: { className: "text-right font-mono tabular-nums" } },
    { id: "status", header: "Status", cell: ({ row }) => <OrderStatusPill status={row.original.status} /> },
    {
      id: "view",
      header: "",
      // Pinned: the table scrolls sideways on narrower screens and View must stay in reach.
      meta: { className: "sticky right-0" },
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => onView(row.original.so)}>
          View
        </Button>
      ),
    },
  ];
}

export function OrdersPage() {
  usePageTitle("Orders");
  const [params, setParams] = useSearchParams();
  const filters: OrderFilters = {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    site: params.get("site") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    page: Math.max(1, Number(params.get("page")) || 1),
  };
  const orders = useOrders(filters);
  const sites = useSites().data ?? NO_SITES;
  const [search, setSearch] = useState(filters.q);
  const [viewing, setViewing] = useState<string | null>(null);

  function update(changes: Partial<Record<(typeof FILTER_KEYS)[number], string>>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!("page" in changes)) next.delete("page"); // any filter change starts again at page 1
        return next;
      },
      { replace: true },
    );
  }

  // Search waits for typing to stop (~300 ms) so not every keystroke calls BC.
  useEffect(() => {
    if (search.trim() === filters.q) return;
    const timer = window.setTimeout(() => update({ q: search.trim() }), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const data = orders.data;
  const rows = data?.orders ?? NO_ORDERS;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  // A page past the end (old link, or a filter shrank the list) lands on the last page.
  useEffect(() => {
    if (data && !orders.isPlaceholderData && filters.page > lastPage) update({ page: lastPage > 1 ? String(lastPage) : "" });
  }, [data, filters.page, lastPage, orders.isPlaceholderData]);

  const showStatus = rows.some((o) => o.status !== null) || !!filters.status;
  const filtered = FILTER_KEYS.some((key) => key !== "page" && filters[key as keyof OrderFilters]);
  const tableColumns = useMemo(() => columns(sites, setViewing), [sites]);

  return (
    <>
      <PageHeader title="Orders" />
      <SectionCard title="Orders">
        <Toolbar
          onClear={() => {
            setSearch("");
            setParams(new URLSearchParams(), { replace: true });
          }}
        >
          <SearchField label="Search orders" placeholder="Search SO number or PO reference" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-[220px]" />
          {showStatus && (
            <Select value={filters.status || ALL} onValueChange={(value) => update({ status: value === ALL ? "" : value })}>
              <SelectTrigger aria-label="Filter by status" className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {ORDER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filters.site || ALL} onValueChange={(value) => update({ site: value === ALL ? "" : value })}>
            <SelectTrigger aria-label="Filter by delivery site" className="w-[230px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All delivery sites</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site.code} value={site.code}>
                  {site.code} — {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DatePicker label="From" value={filters.from} onChange={(from) => update({ from })} />
          <DatePicker label="To" value={filters.to} onChange={(to) => update({ to })} />
        </Toolbar>
        {orders.isError ? (
          <QueryError onRetry={() => void orders.refetch()} />
        ) : (
          <TooltipProvider>
            <DataTable
              label="Orders"
              columns={tableColumns}
              data={rows}
              // Skeleton rows while a search, filter or page change loads (the pager keeps the last total), and while jumping
              // back from a page past the end, so the table never says "no orders" next to "14 orders".
              loading={orders.isPending || orders.isPlaceholderData || filters.page > lastPage}
              emptyMessage={filtered ? "No orders match your filters." : "You don't have any orders yet."}
              className="shadow-none"
            />
            {data && <Pager page={Math.min(filters.page, lastPage)} pageSize={data.pageSize} total={data.total} noun="order" onPage={(page) => update({ page: page > 1 ? String(page) : "" })} />}
          </TooltipProvider>
        )}
      </SectionCard>
      <OrderDialog id={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
