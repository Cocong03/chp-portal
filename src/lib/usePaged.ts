import { useMemo, useState } from 'react'

/**
 * Pages a list that is already fully loaded (Blanket Orders, Drafts, Pending Approval), 10 rows like the Orders tab.
 * The page clamps to the last one when rows shrink (a deleted draft). Spread the rest into `Pager`.
 */
export function usePaged<T>(rows: T[], pageSize = 10) {
  const [wanted, setPage] = useState(1)
  const page = Math.min(wanted, Math.max(1, Math.ceil(rows.length / pageSize)))
  const pageRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize])
  return { pageRows, page, pageSize, total: rows.length, onPage: setPage }
}
