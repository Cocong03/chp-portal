import { tableFeatures, useTable, type ColumnDef, type RowData } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'

export const dataTableFeatures = tableFeatures({})
export type DataColumn<T extends RowData> = ColumnDef<typeof dataTableFeatures, T>

const metaClass = (meta: unknown) => (meta as { className?: string } | undefined)?.className
const LOADING_ROWS = [0, 1, 2]

/**
 * The portal's table (DESIGN.md §5): wireframe header and cell styles, skeleton rows while loading,
 * one centred row when empty. `data` must be stable (memoised or from the query cache). Cells take the row's background,
 * so a column pinned with `meta.className: 'sticky right-0'` covers what scrolls under it.
 */
export function DataTable<T extends RowData>({
  label,
  columns,
  data,
  emptyMessage,
  loading = false,
  className,
}: {
  label: string
  columns: DataColumn<T>[]
  data: T[]
  emptyMessage: string
  loading?: boolean
  className?: string
}) {
  const table = useTable({ features: dataTableFeatures, columns, data })
  const rows = table.getRowModel().rows
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card shadow-card', className)}>
      <Table aria-label={label} aria-busy={loading} className="min-w-[560px]">
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'h-auto bg-muted px-2.5 py-[11px] text-[11.5px] font-semibold tracking-wider whitespace-normal text-faint uppercase',
                    metaClass(header.column.columnDef.meta),
                  )}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            LOADING_ROWS.map((i) => (
              <TableRow key={i}>
                {columns.map((_column, j) => (
                  <TableCell key={j} className="px-2.5 py-[13px]">
                    <Skeleton className="h-4 w-full max-w-32" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="py-[26px] text-center text-[13.5px] text-faint">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="bg-card hover:bg-muted">
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn('bg-inherit px-2.5 py-[13px] text-[13.5px] whitespace-normal', metaClass(cell.column.columnDef.meta))}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
