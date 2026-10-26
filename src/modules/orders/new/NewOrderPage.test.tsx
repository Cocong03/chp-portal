import { act, screen, waitFor, within } from '@testing-library/react'
import { format } from 'date-fns'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { DashboardDto, DraftPayload } from '@/api/types'
import { dashboardMock } from '@/mocks/dashboard'
import { draftsMock, resetDraftsMock } from '@/mocks/drafts'
import { renderApp } from '@/test/render'
import { OrdersSection } from '../OrdersSection'
import { NewOrderPage } from './NewOrderPage'

vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<typeof import('sonner')>()), toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
/** Answer one Server Logic by name; every other endpoint keeps its dev-server mock. */
function answer(name: string, value: unknown) {
  vi.mocked(serverLogic).mockImplementation(async (n, options) => {
    if (n !== name) return actualServerLogic(n, options)
    if (value instanceof Error) throw value
    return value as never
  })
}

const T1_BAG = 'CEM-T1-40KG — Portland Cement Type I — 40kg Bag'
const T2_BULK = 'CEM-T2-BULK — Portland Cement Type II — Bulk'
const WARNING = '⚠ This order exceeds your available credit. You may still submit it for review by our credit team.'

async function openForm() {
  const view = renderApp(<NewOrderPage />, { route: '/orders/new' })
  await screen.findByRole('table', { name: 'Order lines' })
  return view
}
/** A summary or credit row: its label and value share one parent. */
const summary = (label: string) => screen.getByText(label, { selector: 'span' }).parentElement!
const lineRow = (n: number) => within(screen.getByRole('table', { name: 'Order lines' })).getAllByRole('row')[n]
async function pickItem(user: UserEvent, line: number, item: string) {
  await user.click(screen.getByRole('combobox', { name: `Item, line ${line}` }))
  await user.click(await screen.findByRole('option', { name: item }))
}
async function setQty(user: UserEvent, line: number, qty: string) {
  const input = screen.getByRole('spinbutton', { name: `Quantity, line ${line}` })
  await user.clear(input)
  if (qty) await user.type(input, qty)
}

const quoteCalls = () => vi.mocked(serverLogic).mock.calls.filter(([name]) => name === 'order-quote')
/** Waits for BC's quote (debounced 400 ms) to land in a summary row. */
const quoted = (label: string, value: string) => waitFor(() => expect(summary(label)).toHaveTextContent(value))

test('choosing an item fills UOM; BC quotes the unit price, line total and the summary', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  await setQty(user, 1, '10')
  const row = lineRow(1)
  expect(within(row).getByText('BAG')).toBeInTheDocument()
  expect(await within(row).findByText('₱245.00')).toBeInTheDocument()
  expect(within(row).getByText('₱2,450.00')).toBeInTheDocument()
  expect(summary('Lines')).toHaveTextContent('1')
  expect(summary('Subtotal')).toHaveTextContent('₱2,450.00')
  expect(summary('Transport / Freight')).toHaveTextContent('₱0.00')
  expect(summary('Other charges')).toHaveTextContent('₱0.00')
  expect(summary('Order total')).toHaveTextContent('₱2,450.00')
})

// S3-06: one request per order with every chosen line, in the item's sales unit; no customer number from the browser.
test('the quote asks for the chosen lines with the source, and no site for pick up', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  await setQty(user, 1, '10')
  await quoted('Order total', '₱2,450.00')
  expect(quoteCalls().at(-1)).toEqual([
    'order-quote',
    { method: 'POST', body: { shipmentMethod: 'pickup', source: 'PLANT1', site: '', lines: [{ code: 'CEM-T1-40KG', uom: 'BAG', qty: 10 }] } },
  ])
})

test('while a new quote is on its way the old prices are never shown', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  await setQty(user, 1, '10')
  await quoted('Order total', '₱2,450.00')
  await setQty(user, 1, '20')
  expect(screen.queryByText('₱2,450.00')).not.toBeInTheDocument()
  await quoted('Order total', '₱4,900.00')
})

/** Holds every order-quote answer until release() is called; other endpoints answer as usual. */
function holdQuotes() {
  let release = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  vi.mocked(serverLogic).mockImplementation(async (name, options) => {
    if (name === 'order-quote') await gate
    return actualServerLogic(name, options)
  })
  return () => release()
}

test("adding a line keeps the other lines' prices while BC re-quotes; only the new line and the totals wait", async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  await setQty(user, 1, '10')
  await quoted('Order total', '₱2,450.00')
  const release = holdQuotes()
  await user.click(screen.getByRole('button', { name: '+ Add line' }))
  await pickItem(user, 2, T2_BULK)
  await waitFor(() => expect(quoteCalls().at(-1)?.[1]?.body).toMatchObject({ lines: [{ qty: 10 }, { qty: 1 }] }))
  expect(within(lineRow(1)).getByText('₱245.00')).toBeInTheDocument()
  expect(within(lineRow(1)).getByText('₱2,450.00')).toBeInTheDocument()
  expect(within(lineRow(2)).queryByText('₱4,850.00')).not.toBeInTheDocument()
  expect(summary('Order total')).not.toHaveTextContent('₱')
  release()
  await quoted('Order total', '₱7,300.00')
  expect(within(lineRow(2)).getAllByText('₱4,850.00')).toHaveLength(2)
})

test('changing the shipment method hides every price until BC answers', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  await setQty(user, 1, '10')
  await quoted('Order total', '₱2,450.00')
  const release = holdQuotes()
  await user.click(screen.getByRole('radio', { name: 'Delivery' }))
  await waitFor(() => expect(quoteCalls().at(-1)?.[1]?.body).toMatchObject({ shipmentMethod: 'delivery' }))
  expect(within(lineRow(1)).queryByText('₱245.00')).not.toBeInTheDocument()
  release()
  await quoted('Order total', '₱2,600.00')
})

test("BC's message for a line is shown under it", async () => {
  const user = userEvent.setup()
  const line = { unitPrice: 245, lineAmount: 2450, freight: 0, otherCharges: 0, total: 2450, message: 'Price valid until Oct 31.' }
  answer('order-quote', { lines: [line], subtotal: 2450, freight: 0, otherCharges: 0, total: 2450 })
  await openForm()
  await pickItem(user, 1, T1_BAG)
  await setQty(user, 1, '10')
  expect(await within(lineRow(1)).findByText('Price valid until Oct 31.')).toBeInTheDocument()
})

test('a failed quote shows dashes, Try again, and never the credit warning', async () => {
  const user = userEvent.setup()
  answer('order-quote', new ApiError(500, 'x'))
  await openForm()
  await pickItem(user, 1, T2_BULK)
  await setQty(user, 1, '100')
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  expect(within(lineRow(1)).getAllByText('—')).toHaveLength(2)
  for (const label of ['Subtotal', 'Transport / Freight', 'Other charges', 'Order total']) expect(summary(label)).toHaveTextContent('—')
  expect(screen.queryByText(WARNING)).not.toBeInTheDocument()
  vi.mocked(serverLogic).mockImplementation(actualServerLogic)
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await quoted('Order total', '₱485,000.00')
})

test('+ Add line and ✕ change the Lines count', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  await user.click(screen.getByRole('button', { name: '+ Add line' }))
  await pickItem(user, 2, T2_BULK)
  expect(summary('Lines')).toHaveTextContent('2')
  await user.click(screen.getByRole('button', { name: 'Remove line 1' }))
  expect(summary('Lines')).toHaveTextContent('1')
  await quoted('Subtotal', '₱4,850.00')
})

test('a blank or zero quantity counts as nothing', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  for (const qty of ['', '0']) {
    await setQty(user, 1, qty)
    expect(within(lineRow(1)).getAllByText('—')).toHaveLength(2)
    expect(summary('Lines')).toHaveTextContent('0')
    expect(summary('Subtotal')).toHaveTextContent('—')
  }
  expect(document.body).not.toHaveTextContent('NaN')
})

test('removing every line leaves an empty, working table', async () => {
  const user = userEvent.setup()
  await openForm()
  await user.click(screen.getByRole('button', { name: 'Remove line 1' }))
  expect(summary('Lines')).toHaveTextContent('0')
  expect(summary('Subtotal')).toHaveTextContent('—')
  await user.click(screen.getByRole('button', { name: '+ Add line' }))
  expect(screen.getByRole('combobox', { name: 'Item, line 1' })).toBeInTheDocument()
})

// 2026-10-26: cash orders need no credit approval; the warning (and the credit team's review) comes back with Credit in Phase 2.
test('a cash order over the available credit shows no credit warning', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T2_BULK)
  await setQty(user, 1, '100')
  await quoted('Order total', '₱485,000.00')
  expect(screen.queryByText(WARNING)).not.toBeInTheDocument()
})

test('credit standing shows the Dashboard figures', async () => {
  await openForm()
  await waitFor(() => expect(summary('Credit limit')).toHaveTextContent('₱750,000.00'))
  expect(summary('Current exposure')).toHaveTextContent('₱335,750.00')
  expect(summary('Available credit')).toHaveTextContent('₱414,250.00')
  expect(screen.getByText('Exposure = outstanding balance plus orders already placed but not yet invoiced.')).toBeInTheDocument()
})

// S2-09: credit standing is BC's credit overview, read through the dashboard endpoint (order-options stays sample until S3-05).
test("credit standing is BC's figures", async () => {
  answer('dashboard', { ...dashboardMock(), account: { balance: 174000, balanceDue: 24750, overdue: 24750, creditLimit: 500000, exposure: 203220, availableCredit: 2000 } } satisfies DashboardDto)
  await openForm()
  expect(await screen.findByText('₱500,000.00')).toBeInTheDocument()
  expect(summary('Current exposure')).toHaveTextContent('₱203,220.00')
  expect(summary('Available credit')).toHaveTextContent('₱2,000.00')
})

test('credit BC could not give shows dashes and never the warning', async () => {
  const user = userEvent.setup()
  const nulls = { balance: null, balanceDue: null, overdue: null, creditLimit: null, exposure: null, availableCredit: null }
  answer('dashboard', { ...dashboardMock(), account: nulls } satisfies DashboardDto)
  await openForm()
  await waitFor(() => expect(summary('Credit limit')).toHaveTextContent('—'))
  expect(summary('Current exposure')).toHaveTextContent('—')
  expect(summary('Available credit')).toHaveTextContent('—')
  await pickItem(user, 1, T2_BULK)
  await setQty(user, 1, '100')
  await quoted('Order total', '₱485,000.00')
  expect(screen.queryByText(WARNING)).not.toBeInTheDocument()
})

test('the delivery site defaults to the customer default and shows its address', async () => {
  await openForm()
  const site = screen.getByRole('combobox', { name: 'Delivery site' })
  await waitFor(() => expect(site).toHaveTextContent('PLANT1 — Plant 1 — Main Yard'))
  expect(screen.getByText('Plant 1 — Main Yard — Km 19 Marcos Highway, Brgy. San Roque, Antipolo City, Rizal')).toBeInTheDocument()
})

test.each([
  ['no sites', []],
  ['sites failing', new ApiError(500, 'x')],
])('%s → site select disabled, form still works', async (_case, sites) => {
  const user = userEvent.setup()
  answer('sites', sites)
  await openForm()
  await waitFor(() => expect(vi.mocked(serverLogic).mock.calls.some(([name]) => name === 'sites')).toBe(true))
  expect(screen.getByRole('combobox', { name: 'Delivery site' })).toBeDisabled()
  await pickItem(user, 1, T1_BAG)
  await quoted('Subtotal', '₱245.00')
})

test('Blanket Order is disabled; Submit for approval waits for a priced order, with no "Available soon" tooltip', async () => {
  const user = userEvent.setup()
  await openForm()
  expect(screen.getByRole('radio', { name: 'Single Order' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('radio', { name: 'Blanket Order' })).toBeDisabled()
  expect(screen.getByText('For orders with agreed pricing, choose Blanket Order.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save as draft' })).toBeEnabled()
  const submit = screen.getByRole('button', { name: 'Submit for approval' })
  expect(submit).toBeDisabled()
  await user.hover(submit.parentElement!)
  await new Promise((resolve) => setTimeout(resolve, 800))
  expect(screen.queryByText('Available soon.')).not.toBeInTheDocument()
})

test('a failed options load shows Try again', async () => {
  const user = userEvent.setup()
  answer('order-options', new ApiError(500, 'x'))
  renderApp(<NewOrderPage />, { route: '/orders/new' })
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  vi.mocked(serverLogic).mockImplementation(actualServerLogic)
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('table', { name: 'Order lines' })).toBeInTheDocument()
})

test('the page title is set', async () => {
  await openForm()
  expect(document.title).toBe('New Order — Concreat Connect')
})

// S3-08 Delivery & fulfillment (wireframe row 42: Pick up hides the five receiving fields, Delivery hides Pick up date).
const RECEIVING = ['Receiving person', 'Receiving contact number', 'Receiving email', 'Requested delivery date', 'Receiving time window']

test('Delivery shows the receiving fields and hides Pick up date', async () => {
  const user = userEvent.setup()
  await openForm()
  expect(screen.getByLabelText('Pick up date')).toBeVisible()
  for (const label of RECEIVING) expect(screen.getByLabelText(label)).not.toBeVisible()
  await user.click(screen.getByRole('radio', { name: 'Delivery' }))
  for (const label of RECEIVING) expect(screen.getByLabelText(label)).toBeVisible()
  expect(screen.getByLabelText('Pick up date')).not.toBeVisible()
})

// BC Dev 2026-10-23: delivery changes the price and adds freight and fuel per unit; the quote sends the delivery site.
test('switching to Delivery re-quotes with the delivery site; freight and other charges follow', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  await setQty(user, 1, '10')
  await quoted('Transport / Freight', '₱0.00')
  await user.click(screen.getByRole('radio', { name: 'Delivery' }))
  await quoted('Transport / Freight', '₱100.00')
  expect(summary('Other charges')).toHaveTextContent('₱50.00')
  expect(summary('Order total')).toHaveTextContent('₱2,600.00')
  expect(quoteCalls().at(-1)?.[1]?.body).toMatchObject({ shipmentMethod: 'delivery', site: 'PLANT1' })
})

test('fields hidden by the toggle keep their values', async () => {
  const user = userEvent.setup()
  await openForm()
  await user.click(screen.getByRole('radio', { name: 'Delivery' }))
  await user.type(screen.getByLabelText('Receiving person'), 'Juan Dela Cruz')
  await user.click(screen.getByRole('radio', { name: 'Pick up' }))
  await user.click(screen.getByRole('radio', { name: 'Delivery' }))
  expect(screen.getByLabelText('Receiving person')).toHaveValue('Juan Dela Cruz')
})

// 2026-10-26: Cash only; Credit (and its Payment terms) is Phase 2.
test('Cash with Prepayment terms; Credit is listed but not available yet', async () => {
  const user = userEvent.setup()
  await openForm()
  expect(screen.getByRole('combobox', { name: 'Payment method' })).toHaveTextContent('Cash')
  const prepay = screen.getByLabelText('Prepayment terms')
  expect(prepay).toHaveValue('100% advance payment before dispatch')
  expect(prepay).toHaveAttribute('readonly')
  expect(screen.queryByLabelText('Payment terms')).not.toBeInTheDocument()
  await user.click(screen.getByRole('combobox', { name: 'Payment method' }))
  expect(await screen.findByRole('option', { name: 'Credit' })).toHaveAttribute('aria-disabled', 'true')
})

test("Receiving time window offers BC's windows, 8:00 AM – 5:00 PM chosen", async () => {
  const user = userEvent.setup()
  await openForm()
  await user.click(screen.getByRole('radio', { name: 'Delivery' }))
  const window = screen.getByRole('combobox', { name: 'Receiving time window' })
  expect(window).toHaveTextContent('8:00 AM – 5:00 PM')
  await user.click(window)
  expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['12:00 MN – 8:00 AM', '8:00 AM – 5:00 PM', '5:00 PM – 12:00 MN', 'Anytime'])
})

test('loading type and call before delivery rewrite the first instructions line', async () => {
  const user = userEvent.setup()
  await openForm()
  const instructions = screen.getByLabelText('Special delivery instructions')
  expect(instructions).toHaveValue('Loading type: Loose pile. Call before delivery: No.')
  await user.click(instructions)
  await user.keyboard('{Control>}{End}{/Control}{Enter}Gate 2')
  await user.click(screen.getByRole('combobox', { name: 'Loading type' }))
  await user.click(await screen.findByRole('option', { name: 'Palletized' }))
  await user.click(screen.getByRole('checkbox', { name: 'Call before delivery' }))
  expect(instructions).toHaveValue('Loading type: Palletized. Call before delivery: Yes.\nGate 2')
})

test('Source lists the plants with the wireframe note', async () => {
  await openForm()
  expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('PLANT1 — Plant 1 — Main Yard')
  expect(screen.getByText('Choose your preferred source plant.')).toBeInTheDocument()
})

// 2026-10-23: Source lists BC's plants (mcrmSourcePlants) while the rest of order-options is still sample.
test("Source lists BC's plants as code — name", async () => {
  const user = userEvent.setup()
  answer('source-plants', [{ code: 'CAVITE', name: 'CAVITE WAREHOUSE' }, { code: 'SOLID', name: 'SOLID PLANT' }])
  await openForm()
  await user.click(screen.getByRole('combobox', { name: 'Source' }))
  expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['CAVITE — CAVITE WAREHOUSE', 'SOLID — SOLID PLANT'])
})

// Final review 2026-10-21 (Important 1): once order-options is live (S3-05), a failed background refetch must not
// replace the form and lose what the customer typed.
test('a failed background refresh of the options keeps the form and its values', async () => {
  const user = userEvent.setup()
  const { client } = await openForm()
  await user.type(screen.getByLabelText('Your PO reference (optional)'), 'PO-1')
  answer('order-options', new ApiError(500, 'x'))
  await act(() => client.refetchQueries({ queryKey: ['order-options'] }))
  // TanStack notifies observers on a setTimeout; flush it so the failed refetch reaches the UI.
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)))
  expect(client.getQueryState(['order-options'])?.status).toBe('error')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Your PO reference (optional)')).toHaveValue('PO-1')
})

// Final review 2026-10-21 (Important 2): DESIGN.md maps the wireframe toggles to ToggleGroup and dates to Popover + Calendar.
test('arrow keys move between the shipment methods and Space picks one', async () => {
  const user = userEvent.setup()
  await openForm()
  screen.getByRole('radio', { name: 'Pick up' }).focus()
  await user.keyboard('{ArrowRight}')
  const delivery = screen.getByRole('radio', { name: 'Delivery' })
  expect(delivery).toHaveFocus()
  await user.keyboard(' ')
  expect(delivery).toHaveAttribute('aria-checked', 'true')
})

test('clicking the chosen shipment method again keeps it chosen', async () => {
  const user = userEvent.setup()
  await openForm()
  await user.click(screen.getByRole('radio', { name: 'Pick up' }))
  expect(screen.getByRole('radio', { name: 'Pick up' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByLabelText('Pick up date')).toBeVisible()
})

test('the requested delivery date is picked from a calendar', async () => {
  const user = userEvent.setup()
  await openForm()
  await user.click(screen.getByRole('radio', { name: 'Delivery' }))
  const field = screen.getByLabelText('Requested delivery date')
  await user.click(field)
  await user.click(await screen.findByRole('button', { name: /25th/ }))
  const today = new Date()
  expect(field).toHaveTextContent(format(new Date(today.getFullYear(), today.getMonth(), 25), 'MMM d, yyyy'))
})

describe('drafts (S3-12)', () => {
  const SEED_ID = '6f1c2a3e-5b7d-4e8f-9a0b-1c2d3e4f5a01'
  const SAVED = 'Saved as draft. You may go to the Drafts tab to edit, or delete.'

  beforeEach(() => {
    resetDraftsMock()
    vi.mocked(serverLogic).mockImplementation(actualServerLogic)
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.success).mockClear()
  })

  const draftCalls = () =>
    vi.mocked(serverLogic).mock.calls.filter(([name, options]) => name === 'drafts' && options?.method && options.method !== 'GET')
  const lastSaved = () => (draftCalls().at(-1)![1]!.body as { payload: DraftPayload }).payload
  const qty = () => screen.getByRole('spinbutton', { name: 'Quantity, line 1' })
  const siteSelect = () => screen.getByRole('combobox', { name: 'Delivery site' })
  async function openDraft(id = SEED_ID) {
    renderApp(<NewOrderPage />, { route: `/orders/new?draft=${id}` })
    await screen.findByRole('table', { name: 'Order lines' })
  }

  test('Save as draft creates a draft and shows the saved note', async () => {
    const user = userEvent.setup()
    await openForm()
    await pickItem(user, 1, T1_BAG)
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    expect(await screen.findByText(SAVED)).toBeInTheDocument()
    expect(draftCalls().map(([, options]) => options!.method)).toEqual(['POST'])
    expect(lastSaved().form.lines).toEqual([{ code: 'CEM-T1-40KG', qty: 1 }])
    expect(toast.success).toHaveBeenCalledWith('Draft #2 saved', {
      description: 'You may go to the Drafts tab to edit, or delete.',
      action: { label: 'View drafts', onClick: expect.any(Function) },
    })
  })

  test('saving again updates the same draft', async () => {
    const user = userEvent.setup()
    await openForm()
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await screen.findByText(SAVED)
    await setQty(user, 1, '7')
    await user.click(await screen.findByRole('button', { name: 'Save as draft' }))
    await waitFor(() => expect(draftCalls().map(([, options]) => options!.method)).toEqual(['POST', 'PUT']))
    expect((draftsMock({ method: 'GET' }) as unknown[]).length).toBe(2)
    expect(lastSaved().form.lines[0].qty).toBe(7)
  })

  test('Continue fills every field from the draft', async () => {
    await openDraft()
    expect(await screen.findByText('Continuing Draft #1, saved Oct 20, 2026.')).toBeInTheDocument()
    expect(qty()).toHaveValue(10)
    expect(screen.getByRole('combobox', { name: 'Item, line 1' })).toHaveTextContent('CEM-T1-40KG')
    expect(screen.getByRole('radio', { name: 'Delivery' })).toHaveAttribute('aria-checked', 'true')
    expect(siteSelect()).toHaveTextContent('PLANT2 — Plant 2 — North Depot')
    expect(screen.getByLabelText('Your PO reference (optional)')).toHaveValue('PO-8915')
    expect(screen.getByLabelText('Receiving person')).toHaveValue('Ramon Cruz')
  })

  test('a draft without a site is not given the default', async () => {
    const seed = draftsMock({ method: 'GET', query: { id: SEED_ID } }) as { payload: DraftPayload }
    draftsMock({ method: 'PUT', query: { id: SEED_ID }, body: { payload: { ...seed.payload, form: { ...seed.payload.form, site: '' } } } })
    await openDraft()
    await screen.findByText(/Continuing Draft #1/)
    expect(siteSelect()).not.toHaveTextContent('PLANT1')
  })

  test('keeps the saved site when sites fail', async () => {
    const user = userEvent.setup()
    answer('sites', new ApiError(500, 'x'))
    await openDraft()
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await screen.findByText(SAVED)
    expect(lastSaved().form.site).toBe('PLANT2')
  })

  test('a missing draft opens an empty form with a note', async () => {
    await openDraft('00000000-0000-4000-8000-000000000000')
    expect(await screen.findByText('This draft is no longer available.')).toBeInTheDocument()
    expect(qty()).toHaveValue(1)
  })

  test('a draft that could not be found saves as a new one, never over the old id', async () => {
    const user = userEvent.setup()
    await openDraft('00000000-0000-4000-8000-000000000000')
    await screen.findByText('This draft is no longer available.')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await screen.findByText(SAVED)
    expect(draftCalls().map(([, options]) => options!.method)).toEqual(['POST'])
  })

  test('typing while the first save is on its way is kept', async () => {
    const user = userEvent.setup()
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    vi.mocked(serverLogic).mockImplementation(async (name, options) => {
      if (name === 'drafts' && options?.method === 'POST') await gate
      return actualServerLogic(name, options)
    })
    await openForm()
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await user.type(screen.getByLabelText('Your PO reference (optional)'), 'PO-77')
    release()
    await screen.findByText(SAVED)
    expect(screen.getByLabelText('Your PO reference (optional)')).toHaveValue('PO-77')
  })

  test('saving a draft deleted elsewhere creates a new one', async () => {
    const user = userEvent.setup()
    await openDraft()
    draftsMock({ method: 'DELETE', query: { id: SEED_ID } })
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    expect(await screen.findByText(SAVED)).toBeInTheDocument()
    expect(draftCalls().map(([, options]) => options!.method)).toEqual(['PUT', 'POST'])
    expect(draftsMock({ method: 'GET' })).toEqual([expect.objectContaining({ label: 'Draft #1' })])
  })

  test('a failed save keeps the form and shows the toast', async () => {
    const user = userEvent.setup()
    answer('drafts', new ApiError(500, 'x'))
    await openForm()
    await setQty(user, 1, '4')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't save this draft. Please try again."))
    expect(qty()).toHaveValue(4)
    expect(screen.queryByText(SAVED)).not.toBeInTheDocument()
  })

  test('the New Order tab starts a fresh form', async () => {
    const user = userEvent.setup()
    renderApp(
      <Routes>
        <Route path="/orders/*" element={<OrdersSection />} />
      </Routes>,
      { route: `/orders/new?draft=${SEED_ID}` },
    )
    await screen.findByText(/Continuing Draft #1/)
    expect(qty()).toHaveValue(10)
    await user.click(within(screen.getByRole('navigation', { name: 'Orders sections' })).getByRole('link', { name: 'New Order' }))
    await waitFor(() => expect(qty()).toHaveValue(1))
    expect(screen.queryByText(/Continuing Draft #1/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await screen.findByText(SAVED)
    expect(draftCalls().map(([, options]) => options!.method)).toEqual(['POST'])
  })
})

describe('submit (S3-10)', () => {
  const SEED_ID = '6f1c2a3e-5b7d-4e8f-9a0b-1c2d3e4f5a01'

  beforeEach(() => {
    resetDraftsMock()
    vi.mocked(serverLogic).mockImplementation(actualServerLogic)
    vi.mocked(toast.error).mockClear()
  })

  const submit = () => screen.getByRole('button', { name: 'Submit for approval' })
  const orderPosts = () => vi.mocked(serverLogic).mock.calls.filter(([name, options]) => name === 'orders' && options?.method === 'POST')
  function openSection(route = '/orders/new') {
    renderApp(
      <Routes>
        <Route path="/orders/*" element={<OrdersSection />} />
      </Routes>,
      { route },
    )
  }

  test('Submit is enabled once BC has priced the order', async () => {
    const user = userEvent.setup()
    await openForm()
    expect(submit()).toBeDisabled()
    await pickItem(user, 1, T1_BAG)
    await quoted('Order total', '₱245.00')
    expect(submit()).toBeEnabled()
  })

  test('Submit sends the order (never its prices) and opens Orders with the new order number', async () => {
    const user = userEvent.setup()
    openSection()
    await screen.findByRole('table', { name: 'Order lines' })
    await pickItem(user, 1, T1_BAG)
    await setQty(user, 1, '10')
    await user.type(screen.getByLabelText('Your PO reference (optional)'), 'PO-8915')
    await quoted('Order total', '₱2,450.00')
    await user.click(submit())
    expect(await screen.findByText('SO-100500 was submitted.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'page')
    expect(orderPosts()).toHaveLength(1)
    expect(orderPosts()[0][1]!.body).toEqual({
      shipmentMethod: 'pickup', source: 'PLANT1', site: '', lines: [{ code: 'CEM-T1-40KG', uom: 'BAG', qty: 10 }], paymentMethod: 'cash',
      poRef: 'PO-8915', pickupDate: '', requestedDate: '', receivingPerson: '', receivingContact: '', receivingEmail: '', timeWindow: 'DAY',
      instructions: 'Loading type: Loose pile. Call before delivery: No.',
    })
  })

  test("a line BC can't price keeps Submit disabled", async () => {
    const user = userEvent.setup()
    const line = { unitPrice: 0, lineAmount: 0, freight: 0, otherCharges: 0, total: 0, message: 'No price is set up for this delivery area.' }
    answer('order-quote', { lines: [line], subtotal: 0, freight: 0, otherCharges: 0, total: 0 })
    await openForm()
    await pickItem(user, 1, T1_BAG)
    expect(await screen.findByText(line.message)).toBeInTheDocument()
    expect(submit()).toBeDisabled()
  })

  test.each([
    ["BC can't price a line any more", { notPriced: true }, "We couldn't price every line. Please check your order and try again."],
    ['the submit fails', new ApiError(500, 'x'), "We couldn't submit this order. Please try again."],
  ])('%s: a message, and the form stays as it was', async (_case, reply, message) => {
    const user = userEvent.setup()
    answer('orders', reply)
    await openForm()
    await pickItem(user, 1, T1_BAG)
    await setQty(user, 1, '10')
    await quoted('Order total', '₱2,450.00')
    await user.click(submit())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
    expect(screen.getByRole('spinbutton', { name: 'Quantity, line 1' })).toHaveValue(10)
  })

  test('an invalid receiving email is caught before anything is sent', async () => {
    const user = userEvent.setup()
    await openForm()
    await pickItem(user, 1, T1_BAG)
    await user.click(screen.getByRole('radio', { name: 'Delivery' }))
    await user.type(screen.getByLabelText('Receiving email'), 'juan.test.ph')
    await quoted('Order total', '₱260.00')
    await user.click(submit())
    expect(toast.error).toHaveBeenCalledWith('Please enter a valid receiving email.')
    expect(orderPosts()).toEqual([])
  })

  test('submitting a draft removes the draft', async () => {
    const user = userEvent.setup()
    openSection(`/orders/new?draft=${SEED_ID}`)
    await screen.findByText(/Continuing Draft #1/)
    await quoted('Order total', '₱2,600.00')
    await user.click(submit())
    expect(await screen.findByText('SO-100500 was submitted.')).toBeInTheDocument()
    await waitFor(() => expect(draftsMock({ method: 'GET' })).toEqual([]))
    expect(orderPosts()[0][1]!.body).toMatchObject({ shipmentMethod: 'delivery', site: 'PLANT2', timeWindow: 'DAY' })
  })
})
