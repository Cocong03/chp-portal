import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { serverLogic } from "@/api/serverLogic";
import type { OrderSummaryDto, OrdersPageDto, SiteDto } from "@/api/types";
import { downloadXlsx } from "@/lib/excel";
import { formatDate, peso } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";
import { sitesQuery, useSites } from "@/modules/sites/useSites";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui/tooltip";
import { OrderDialog } from "./OrderDialog";
import { ORDER_STATUSES, OrderStatusPill, ShipBadge } from "./orderDisplay";
import { ordersQuery, useOrders, type OrderFilters } from "./useOrders";

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

const EXPORT_COLUMNS = ["Sales Order #", "Order date", "PO reference", "Delivery site", "Site name", "Ship", "Blanket SO #", "Trip ID", "Expected delivery", "Total", "Status"];

// One spreadsheet row per order: real dates and a numeric Total, so Excel can sort and sum them.
function exportRow(order: OrderSummaryDto, sites: SiteDto[]) {
  return {
    "Sales Order #": order.so,
    "Order date": order.date ? parseISO(order.date) : "",
    "PO reference": order.po,
    "Delivery site": order.site,
    "Site name": sites.find((s) => s.code === order.site)?.name ?? "",
    Ship: order.ship ?? "",
    "Blanket SO #": order.bso ?? "",
    "Trip ID": order.trip?.id ?? "",
    "Expected delivery": order.edd ? parseISO(order.edd) : "",
    Total: order.total,
    Status: order.status ?? "",
  };
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
  const [exporting, setExporting] = useState(false);
  const queryClient = useQueryClient();
  // Set by New Order after Submit (S3-10).
  const submitted = (useLocation().state as { submitted?: string } | null)?.submitted;

  // S3-14: every order matching the filters (all=true), not just this page.
  async function exportOrders() {
    setExporting(true);
    try {
      // Site names need the site list, which may still be loading; without it the export still runs, codes only.
      const [all, siteList] = await Promise.all([
        serverLogic<OrdersPageDto>("orders", { query: { ...ordersQuery({ ...filters, page: 1 }), all: "true" } }),
        queryClient.ensureQueryData(sitesQuery).catch(() => NO_SITES),
      ]);
      await downloadXlsx(`Orders-${format(new Date(), "yyyy-MM-dd")}.xlsx`, "Orders", EXPORT_COLUMNS, all.orders.map((order) => exportRow(order, siteList)));
    } catch {
      toast.error("We couldn't download your orders. Please try again.");
    } finally {
      setExporting(false);
    }
  }

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
      <PageHeader title="Orders">
        <Button asChild>
          <Link to="/orders/new">+ New Order</Link>
        </Button>
      </PageHeader>
      {submitted && (
        <p role="status" className="mb-3.5 text-[12.5px] font-semibold text-success">
          {submitted} was submitted.
        </p>
      )}
      <SectionCard title="Orders">
        <Toolbar
          onClear={() => {
            setSearch("");
            setParams(new URLSearchParams(), { replace: true });
          }}
          actions={
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" onClick={() => void exportOrders()} disabled={exporting}>
                    <Download aria-hidden />
                    {exporting ? "Preparing…" : "CSV / Excel"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Downloads all orders matching your filters.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          }
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
