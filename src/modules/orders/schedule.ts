/** One planned delivery against a Blanket Order (S3-16): item code, estimated quantity, expected date (YYYY-MM-DD or ""). */
export interface ScheduleRow {
  item: string
  qty: number
  date: string
}

/** An ordered line the schedule is planned against. */
export interface ScheduleItem {
  code: string
  description: string
  qty: number
}

/**
 * Scheduled against ordered per item (wireframe `renderScheduleSummary`): one entry per ordered item in line order, with
 * duplicate lines and rows summed. Rows for items not on the order, and blank quantities, count for nothing.
 */
export function scheduleSummary(ordered: ScheduleItem[], rows: ScheduleRow[]) {
  const items: { code: string; description: string; ordered: number; scheduled: number; over: boolean }[] = []
  for (const line of ordered) {
    const seen = items.find((each) => each.code === line.code)
    if (seen) seen.ordered += line.qty
    else items.push({ code: line.code, description: line.description, ordered: line.qty, scheduled: 0, over: false })
  }
  for (const row of rows) {
    const item = items.find((each) => each.code === row.item)
    if (item && Number.isFinite(row.qty)) item.scheduled += row.qty
  }
  for (const item of items) item.over = item.scheduled > item.ordered
  return items
}

/** A new delivery row: the first ordered item, qty 1, no date (the wireframe's select starts on its first option). */
export function newScheduleRow(ordered: ScheduleItem[]): ScheduleRow {
  return { item: ordered[0]?.code ?? '', qty: 1, date: '' }
}
