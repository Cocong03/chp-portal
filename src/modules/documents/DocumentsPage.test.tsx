import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ApiError, serverLogic } from '@/api/serverLogic'
import { downloadXlsx } from '@/lib/excel'
import { renderApp } from '@/test/render'
import { DocumentsPage } from './DocumentsPage'
import { downloadDocument } from './downloadDocument'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})
vi.mock('./downloadDocument', () => ({ downloadDocument: vi.fn() }))
vi.mock('@/lib/excel', () => ({ downloadXlsx: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
const lastQuery = () => vi.mocked(serverLogic).mock.calls.filter(([name]) => name === 'documents').at(-1)?.[1]?.query
const table = () => screen.findByRole('table', { name: 'Documents' })
const summary = (text: string) => screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === text)

beforeEach(() => {
  vi.mocked(serverLogic).mockImplementation(actualServerLogic)
  vi.mocked(downloadDocument).mockResolvedValue(undefined)
})

test('shows the wireframe columns and the newest document first, with the page title', async () => {
  renderApp(<DocumentsPage />, { route: '/documents' })
  const documents = await table()
  const row = await within(documents).findByRole('row', { name: /INV-88611/ })
  expect(within(documents).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Document type', 'Reference no.', 'Sales order no.', 'Date', 'Amount', '',
  ])
  expect(within(row).getByText('SO-100478')).toBeInTheDocument()
  expect(within(row).getByText('Sep 12, 2026')).toBeInTheDocument()
  expect(within(row).getByText('₱63,250.00')).toBeInTheDocument()
  expect(within(documents).getAllByRole('row')[1]).toBe(row)
  expect(document.title).toBe('Document Center — Concreat Connect')
})

test('a dash for a document with no SO and for a delivery receipt amount', async () => {
  renderApp(<DocumentsPage />, { route: '/documents' })
  const documents = await table()
  const payment = await within(documents).findByRole('row', { name: /PMT-20441/ })
  expect(within(payment).getAllByText('—')).toHaveLength(1)
  const receipt = within(documents).getByRole('row', { name: /PWS-100478/ })
  expect(within(receipt).getAllByText('—')).toHaveLength(1)
})

test('the summary line counts the filtered documents', async () => {
  const user = userEvent.setup()
  renderApp(<DocumentsPage />, { route: '/documents' })
  expect(await summary('Showing 10 documents for the current filters.')).toBeInTheDocument()
  await user.click(screen.getByRole('combobox', { name: 'Filter by document type' }))
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    'All document types', 'Invoice', 'Credit Memo', 'Acknowledgement Receipt', 'Delivery Receipt',
  ])
  await user.click(screen.getByRole('option', { name: 'Delivery Receipt' }))
  expect(await summary('Showing 1 documents for the current filters.')).toBeInTheDocument()
})

test('type, dates and search write the query and go back to page 1', async () => {
  const user = userEvent.setup()
  renderApp(<DocumentsPage />, { route: '/documents?page=2&from=2026-07-01&to=2026-09-30' })
  await table()
  await waitFor(() => expect(lastQuery()).toEqual({ from: '2026-07-01', to: '2026-09-30' }))
  expect(screen.getByRole('button', { name: 'From Jul 1, 2026' })).toBeInTheDocument()
  await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), 'INV-88611')
  await waitFor(() => expect(lastQuery()).toEqual({ q: 'INV-88611', from: '2026-07-01', to: '2026-09-30' }))
  await user.click(screen.getByRole('combobox', { name: 'Filter by document type' }))
  await user.click(screen.getByRole('option', { name: 'Invoice' }))
  await waitFor(() => expect(lastQuery()).toEqual({ q: 'INV-88611', type: 'Invoice', from: '2026-07-01', to: '2026-09-30' }))
})

test('Clear filters resets everything', async () => {
  const user = userEvent.setup()
  renderApp(<DocumentsPage />, { route: '/documents?type=Invoice&q=INV&from=2026-07-01' })
  await table()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(lastQuery()).toEqual({}))
  expect(screen.getByRole('combobox', { name: 'Filter by document type' })).toHaveTextContent('All document types')
  expect(screen.getByRole('searchbox', { name: 'Search documents' })).toHaveValue('')
})

test('a search with no match says so', async () => {
  const user = userEvent.setup()
  renderApp(<DocumentsPage />, { route: '/documents' })
  await table()
  await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), 'zzz')
  expect(await screen.findByRole('cell', { name: 'No documents match your filters.' })).toBeInTheDocument()
})

test('Download shows Preparing… on that row only, then saves the file', async () => {
  const user = userEvent.setup()
  let finish = () => {}
  vi.mocked(downloadDocument).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
  renderApp(<DocumentsPage />, { route: '/documents' })
  const row = await within(await table()).findByRole('row', { name: /INV-88611/ })
  await user.click(within(row).getByRole('button', { name: 'Download' }))
  expect(downloadDocument).toHaveBeenCalledWith(expect.objectContaining({ type: 'Invoice', ref: 'INV-88611' }))
  expect(within(row).getByRole('button', { name: 'Preparing…' })).toBeDisabled()
  expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(9)
  finish()
  expect(await within(row).findByRole('button', { name: 'Download' })).toBeEnabled()
})

test('two downloads at once each show their own state', async () => {
  const user = userEvent.setup()
  vi.mocked(downloadDocument).mockReturnValue(new Promise<void>(() => {}))
  renderApp(<DocumentsPage />, { route: '/documents' })
  const documents = await table()
  await user.click(within(await within(documents).findByRole('row', { name: /INV-88611/ })).getByRole('button', { name: 'Download' }))
  await user.click(within(within(documents).getByRole('row', { name: /INV-88604/ })).getByRole('button', { name: 'Download' }))
  expect(screen.getAllByRole('button', { name: 'Preparing…' })).toHaveLength(2)
})

test('a failed download shows the toast', async () => {
  const user = userEvent.setup()
  vi.mocked(downloadDocument).mockRejectedValue(new Error('x'))
  renderApp(<DocumentsPage />, { route: '/documents' })
  const row = await within(await table()).findByRole('row', { name: /INV-88611/ })
  await user.click(within(row).getByRole('button', { name: 'Download' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't download this document. Please try again."))
  expect(within(row).getByRole('button', { name: 'Download' })).toBeEnabled()
})

test('CSV / Excel exports every filtered document', async () => {
  const user = userEvent.setup()
  renderApp(<DocumentsPage />, { route: '/documents' })
  await table()
  await user.click(screen.getByRole('button', { name: 'CSV / Excel' }))
  await waitFor(() => expect(downloadXlsx).toHaveBeenCalledTimes(1))
  const [fileName, sheet, header, rows] = vi.mocked(downloadXlsx).mock.calls[0]
  expect(fileName).toMatch(/^Documents-\d{4}-\d{2}-\d{2}\.xlsx$/)
  expect(sheet).toBe('Documents')
  expect(header).toEqual(['Document type', 'Reference no.', 'Sales order no.', 'PO reference', 'Date', 'Amount'])
  expect(rows).toHaveLength(10)
  expect(rows[0]['Date']).toBeInstanceOf(Date)
  expect(rows.find((r) => r['Document type'] === 'Delivery Receipt')?.['Amount']).toBeNull()
  expect(lastQuery()).toEqual({ all: 'true' })
})

test('a failed export shows the toast', async () => {
  const user = userEvent.setup()
  vi.mocked(downloadXlsx).mockRejectedValueOnce(new Error('x'))
  renderApp(<DocumentsPage />, { route: '/documents' })
  await table()
  await user.click(screen.getByRole('button', { name: 'CSV / Excel' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't download your documents. Please try again."))
})

test('the error state offers Try again', async () => {
  const user = userEvent.setup()
  vi.mocked(serverLogic).mockImplementation(async (name, options) => {
    if (name === 'documents') throw new ApiError(500, 'x')
    return actualServerLogic(name, options)
  })
  renderApp(<DocumentsPage />, { route: '/documents' })
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  vi.mocked(serverLogic).mockImplementation(actualServerLogic)
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await within(await table()).findByRole('row', { name: /INV-88611/ })).toBeInTheDocument()
})

test('no Statement of Account or Bulk PDF on the page', async () => {
  renderApp(<DocumentsPage />, { route: '/documents' })
  await table()
  expect(screen.queryByText(/Statement of Account/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/Bulk PDF/i)).not.toBeInTheDocument()
})
