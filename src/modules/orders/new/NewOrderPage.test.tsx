import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import { renderApp } from '@/test/render'
import { NewOrderPage } from './NewOrderPage'

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

test('choosing an item fills UOM and unit price; qty drives the line total and the summary', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  await setQty(user, 1, '10')
  const row = lineRow(1)
  expect(within(row).getByText('BAG')).toBeInTheDocument()
  expect(within(row).getByText('₱245.00')).toBeInTheDocument()
  expect(within(row).getByText('₱2,450.00')).toBeInTheDocument()
  expect(summary('Lines')).toHaveTextContent('1')
  expect(summary('Subtotal')).toHaveTextContent('₱2,450.00')
  expect(summary('Transport / Freight')).toHaveTextContent('₱0.00')
  expect(summary('Other charges')).toHaveTextContent('₱0.00')
  expect(summary('Order total')).toHaveTextContent('₱2,450.00')
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
  expect(summary('Subtotal')).toHaveTextContent('₱4,850.00')
})

test('a blank or zero quantity counts as nothing', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  for (const qty of ['', '0']) {
    await setQty(user, 1, qty)
    expect(within(lineRow(1)).getAllByText('—')).toHaveLength(1)
    expect(summary('Lines')).toHaveTextContent('0')
    expect(summary('Subtotal')).toHaveTextContent('₱0.00')
  }
  expect(document.body).not.toHaveTextContent('NaN')
})

test('removing every line leaves an empty, working table', async () => {
  const user = userEvent.setup()
  await openForm()
  await user.click(screen.getByRole('button', { name: 'Remove line 1' }))
  expect(summary('Lines')).toHaveTextContent('0')
  expect(summary('Subtotal')).toHaveTextContent('₱0.00')
  await user.click(screen.getByRole('button', { name: '+ Add line' }))
  expect(screen.getByRole('combobox', { name: 'Item, line 1' })).toBeInTheDocument()
})

test('the credit warning shows only when the order total exceeds available credit', async () => {
  const user = userEvent.setup()
  await openForm()
  await pickItem(user, 1, T1_BAG)
  await setQty(user, 1, '10')
  expect(screen.queryByText(WARNING)).not.toBeInTheDocument()
  await pickItem(user, 1, T2_BULK)
  await setQty(user, 1, '100')
  expect(summary('Order total')).toHaveTextContent('₱485,000.00')
  expect(screen.getByText(WARNING)).toBeInTheDocument()
})

test('credit standing shows the Dashboard figures', async () => {
  await openForm()
  expect(summary('Credit limit')).toHaveTextContent('₱750,000.00')
  expect(summary('Current exposure')).toHaveTextContent('₱335,750.00')
  expect(summary('Available credit')).toHaveTextContent('₱414,250.00')
  expect(screen.getByText('Exposure = outstanding balance plus orders already placed but not yet invoiced.')).toBeInTheDocument()
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
  expect(summary('Subtotal')).toHaveTextContent('₱245.00')
})

test('Blanket Order, Save as draft and Submit for approval are disabled', async () => {
  const user = userEvent.setup()
  await openForm()
  expect(screen.getByRole('radio', { name: 'Single Order' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('radio', { name: 'Blanket Order' })).toBeDisabled()
  expect(screen.getByText('For orders with agreed pricing, choose Blanket Order.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save as draft' })).toBeDisabled()
  const submit = screen.getByRole('button', { name: 'Submit for approval' })
  expect(submit).toBeDisabled()
  await user.hover(submit.parentElement!)
  expect((await screen.findAllByText('Available soon.')).length).toBeGreaterThan(0)
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

test('Delivery shows the receiving fields and hides Pick up date; freight follows', async () => {
  const user = userEvent.setup()
  await openForm()
  expect(screen.getByLabelText('Pick up date')).toBeVisible()
  for (const label of RECEIVING) expect(screen.getByLabelText(label)).not.toBeVisible()
  expect(summary('Transport / Freight')).toHaveTextContent('₱0.00')
  await user.click(screen.getByRole('radio', { name: 'Delivery' }))
  for (const label of RECEIVING) expect(screen.getByLabelText(label)).toBeVisible()
  expect(screen.getByLabelText('Pick up date')).not.toBeVisible()
  expect(summary('Transport / Freight')).toHaveTextContent('₱3,500.00')
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

test('Cash shows Prepayment terms, Terms shows Payment terms', async () => {
  const user = userEvent.setup()
  await openForm()
  const prepay = screen.getByLabelText('Prepayment terms')
  expect(prepay).toHaveValue('100% advance payment before dispatch')
  expect(prepay).toHaveAttribute('readonly')
  expect(screen.queryByLabelText('Payment terms')).not.toBeInTheDocument()
  await user.click(screen.getByRole('combobox', { name: 'Payment method' }))
  await user.click(await screen.findByRole('option', { name: 'Terms' }))
  expect(screen.getByLabelText('Payment terms')).toHaveValue('30 Days from Invoice Date')
  expect(screen.queryByLabelText('Prepayment terms')).not.toBeInTheDocument()
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
