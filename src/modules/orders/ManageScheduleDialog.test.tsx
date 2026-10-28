import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { serverLogic } from '@/api/serverLogic'
import { MOCK_BLANKET_ORDERS } from '@/mocks/orders'
import { renderApp } from '@/test/render'
import { ManageScheduleDialog } from './ManageScheduleDialog'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})
const actualServerLogic = (await vi.importActual<typeof import('@/api/serverLogic')>('@/api/serverLogic')).serverLogic
afterEach(() => vi.mocked(serverLogic).mockImplementation(actualServerLogic))

const CAPTION =
  'Add or adjust when each item ships against this Blanket Order, any time. Saving, routes the update to our Customer Service team to confirm the scheduling. The total scheduled per item can never exceed what is on this Blanket Order.'
const OVER = 'One or more items exceed the quantity in the Blanket Sales Order. Please adjust the quantity before saving.'

async function openDialog({ onClose = () => {}, onSaved = () => {} }: { onClose?: () => void; onSaved?: (so: string) => void } = {}) {
  renderApp(<ManageScheduleDialog so="BSO-20441" onClose={onClose} onSaved={onSaved} />)
  const dialog = await screen.findByRole('dialog', { name: 'Delivery schedule — BSO-20441' })
  await within(dialog).findByRole('combobox', { name: 'Delivery item, row 1' })
  return dialog
}

test('opens with the caption and one delivery row for the first item', async () => {
  const dialog = await openDialog()
  expect(within(dialog).getByText(CAPTION)).toBeInTheDocument()
  expect(within(dialog).getByRole('combobox', { name: 'Delivery item, row 1' })).toHaveTextContent('CEM-T1-40KG — Portland Cement Type I — 40kg Bag')
  expect(within(dialog).queryByRole('combobox', { name: 'Delivery item, row 2' })).not.toBeInTheDocument()
  expect(within(dialog).queryByText(OVER)).not.toBeInTheDocument()
})

test('over quantity shows the error and disables Save schedule', async () => {
  const user = userEvent.setup()
  const dialog = await openDialog()
  const qty = within(dialog).getByRole('spinbutton', { name: 'Est. quantity, row 1' })
  await user.clear(qty)
  await user.type(qty, '2001')
  expect(within(dialog).getByText(OVER)).toBeInTheDocument()
  expect(within(dialog).getByText('Over by 1 — reduce a scheduled quantity above')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Save schedule' })).toBeDisabled()
})

test('Save schedule calls onSaved with the BSO and makes no network call', async () => {
  const user = userEvent.setup()
  const onSaved = vi.fn()
  const onClose = vi.fn()
  const dialog = await openDialog({ onSaved, onClose })
  const calls = vi.mocked(serverLogic).mock.calls.length
  await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }))
  expect(onSaved).toHaveBeenCalledWith('BSO-20441')
  expect(onClose).toHaveBeenCalled()
  expect(vi.mocked(serverLogic).mock.calls.length).toBe(calls)
})

test('Cancel closes without saving', async () => {
  const user = userEvent.setup()
  const onSaved = vi.fn()
  const onClose = vi.fn()
  const dialog = await openDialog({ onSaved, onClose })
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

test('a BSO with no lines shows No items on this Blanket Order. and disables Add delivery and Save', async () => {
  vi.mocked(serverLogic).mockImplementation(async (name, options) =>
    name === 'orders' ? ({ ...MOCK_BLANKET_ORDERS[0], lines: [] } as never) : actualServerLogic(name, options),
  )
  renderApp(<ManageScheduleDialog so="BSO-20441" onClose={() => {}} onSaved={() => {}} />)
  const dialog = await screen.findByRole('dialog', { name: 'Delivery schedule — BSO-20441' })
  expect(await within(dialog).findByText('No items on this Blanket Order.')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: '+ Add delivery' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Save schedule' })).toBeDisabled()
})
