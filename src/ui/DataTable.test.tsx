import { render, screen, within } from '@testing-library/react'
import { DataTable, type DataColumn } from './DataTable'

type Row = { code: string; city: string }
const columns: DataColumn<Row>[] = [
  { id: 'code', header: 'Code', cell: ({ row }) => row.original.code, meta: { className: 'font-mono' } },
  { id: 'city', header: 'City', cell: ({ row }) => row.original.city },
]
const rows: Row[] = [
  { code: 'PLANT1', city: 'Antipolo' },
  { code: 'PLANT2', city: 'Angat' },
]
const none: Row[] = []

test('renders headers and one row per item', () => {
  render(<DataTable label="Sites" columns={columns} data={rows} emptyMessage="Nothing here." />)
  const table = screen.getByRole('table', { name: 'Sites' })
  expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Code', 'City'])
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(within(table).getByRole('cell', { name: 'PLANT2' })).toBeInTheDocument()
})

test('an empty list shows one row with the message across all columns', () => {
  render(<DataTable label="Sites" columns={columns} data={none} emptyMessage="Nothing here." />)
  expect(screen.getByRole('cell', { name: 'Nothing here.' })).toHaveAttribute('colspan', '2')
})

test('while loading it shows placeholder rows and no empty message', () => {
  render(<DataTable label="Sites" columns={columns} data={none} loading emptyMessage="Nothing here." />)
  expect(screen.queryByText('Nothing here.')).not.toBeInTheDocument()
  expect(screen.getByRole('table', { name: 'Sites' })).toHaveAttribute('aria-busy', 'true')
})
