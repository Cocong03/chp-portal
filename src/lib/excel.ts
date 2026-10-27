/**
 * Builds a one-sheet .xlsx and downloads it. Each row is keyed by column header; `header` fixes the column order and keeps
 * the headers when there are no rows. SheetJS loads only here, on the first download.
 */
export async function downloadXlsx(fileName: string, sheetName: string, header: string[], rows: Record<string, unknown>[]) {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(rows, { header, dateNF: 'mmm d, yyyy' })
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, sheetName)
  XLSX.writeFile(book, fileName)
}
