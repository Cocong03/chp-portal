import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { GENERIC_ERROR, serverLogic } from '@/api/serverLogic'
import { resetServiceMocks } from '@/mocks/service'
import { renderApp } from '@/test/render'
import { NewRequestDialog } from './NewRequestDialog'
import { RequestsPage } from './RequestsPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => {
  resetServiceMocks()
  vi.clearAllMocks()
})

type User = ReturnType<typeof userEvent.setup>
const posts = () => vi.mocked(serverLogic).mock.calls.filter(([name, options]) => name === 'requests' && options?.method === 'POST')

async function pick(user: User, label: string, option: string) {
  await user.click(await screen.findByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

async function open() {
  const user = userEvent.setup()
  const onClose = vi.fn()
  renderApp(<NewRequestDialog open onClose={onClose} />)
  await screen.findByRole('combobox', { name: 'Category' })
  return { user, onClose }
}

async function fillMinimal(user: User) {
  await pick(user, 'Category', 'Other Request')
  await pick(user, 'Request type', 'Others')
  await user.type(screen.getByRole('textbox', { name: 'Request details' }), 'Need help')
}

test('request type and assigned group follow the category', async () => {
  const { user } = await open()
  expect(screen.getByRole('combobox', { name: 'Request type' })).toBeDisabled()
  expect(screen.getByLabelText('Assigned group')).toHaveAttribute('placeholder', 'Filled in once a request type is chosen')
  await pick(user, 'Category', 'Document Copy')
  await user.click(screen.getByRole('combobox', { name: 'Request type' }))
  expect(screen.getAllByRole('option')).toHaveLength(4)
  await user.click(screen.getByRole('option', { name: 'Delivery Receipt (DR)' }))
  expect(screen.getByLabelText('Assigned group')).toHaveValue('Service Center')
})

test('Delivery shows trip, related sales order and delivery site; Sales Order shows only "Sales Order Number"', async () => {
  const { user } = await open()
  await pick(user, 'Category', 'Delivery')
  expect(screen.getByLabelText('Trip ID reference')).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Related Sales Order' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Delivery site (Ship-to Address)' })).toBeInTheDocument()
  await pick(user, 'Category', 'Sales Order')
  expect(screen.getByRole('combobox', { name: 'Sales Order Number' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Trip ID reference')).toBeNull()
  expect(screen.queryByRole('combobox', { name: 'Delivery site (Ship-to Address)' })).toBeNull()
})

test('fields from a previous category are not sent', async () => {
  const { user } = await open()
  await pick(user, 'Category', 'Delivery')
  await user.type(screen.getByLabelText('Trip ID reference'), 'TRP-1')
  await pick(user, 'Category', 'Sales Order')
  await pick(user, 'Request type', 'Inquiry')
  await pick(user, 'Sales Order Number', 'SO-100467')
  await user.type(screen.getByRole('textbox', { name: 'Request details' }), 'Please check')
  await user.click(screen.getByRole('button', { name: 'Submit request' }))
  await waitFor(() => expect(posts()).toHaveLength(1))
  expect(posts()[0][1]?.body).toMatchObject({ category: 'Sales Order', requestType: 'Inquiry', fields: { order: 'SO-100467' } })
  expect((posts()[0][1]?.body as { fields: unknown }).fields).toEqual({ order: 'SO-100467' })
})

test('required fields block submit with messages', async () => {
  const { user } = await open()
  await user.click(screen.getByRole('button', { name: 'Submit request' }))
  expect(await screen.findByText('Select a category.')).toBeInTheDocument()
  expect(screen.getByText('Enter the request details.')).toBeInTheDocument()
  expect(posts()).toHaveLength(0)
})

test('contact person is read-only and shows the signed-in user', async () => {
  await open()
  const person = await screen.findByLabelText('Contact person')
  expect(person).toHaveAttribute('readonly')
  expect(person).toHaveValue('J.D. Santos')
  expect(screen.getByText('Requestor')).toBeInTheDocument()
  expect(await screen.findByLabelText('Email address')).toHaveValue('full@test.ph')
})

test('Submit is disabled while sending — a double click posts once', async () => {
  const { user } = await open()
  await fillMinimal(user)
  let release: () => void = () => {}
  vi.mocked(serverLogic).mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ ref: 'RQ-1' }))) as never)
  const submit = screen.getByRole('button', { name: 'Submit request' })
  await user.dblClick(submit)
  expect(submit).toBeDisabled()
  expect(posts()).toHaveLength(1)
  release()
  await waitFor(() => expect(toast.success).toHaveBeenCalled())
})

test('a successful submit closes the dialog and the new request is at the top as Submitted', async () => {
  const user = userEvent.setup()
  renderApp(<RequestsPage />)
  await screen.findByRole('row', { name: /RQ-30101/ })
  await user.click(screen.getByRole('button', { name: 'New request' }))
  await fillMinimal(user)
  await user.click(screen.getByRole('button', { name: 'Submit request' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Request RQ-30104 submitted.'))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New request' })).toBeNull())
  await waitFor(() => expect(screen.getAllByRole('row')[1]).toHaveTextContent('RQ-30104'))
  expect(within(screen.getAllByRole('row')[1]).getByText('Submitted')).toBeInTheDocument()
})

test('a saved request whose number could not be read back still confirms and closes', async () => {
  const { user, onClose } = await open()
  await fillMinimal(user)
  vi.mocked(serverLogic).mockImplementationOnce(async () => ({ ref: '' }) as never)
  await user.click(screen.getByRole('button', { name: 'Submit request' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Request submitted.'))
  expect(onClose).toHaveBeenCalled()
})

test('a failed submit keeps the dialog open with the values', async () => {
  const { user, onClose } = await open()
  await fillMinimal(user)
  vi.mocked(serverLogic).mockRejectedValueOnce(new Error('boom'))
  await user.click(screen.getByRole('button', { name: 'Submit request' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(GENERIC_ERROR))
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'Request details' })).toHaveValue('Need help')
})

test('an invalid answer from the server asks the user to check the form', async () => {
  const { user } = await open()
  await fillMinimal(user)
  vi.mocked(serverLogic).mockResolvedValueOnce({ invalid: true, field: 'details' } as never)
  await user.click(screen.getByRole('button', { name: 'Submit request' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Please check the form and try again.'))
})

test('the dialog has no intro or hint lines', async () => {
  await open()
  expect(screen.queryByText(/This starts a review/)).toBeNull()
  expect(screen.queryByText(/Must be a user with access/)).toBeNull()
})

test('Cancel closes without saving', async () => {
  const { user, onClose } = await open()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalled()
  expect(posts()).toHaveLength(0)
})

/** A FileReader whose reads finish only when the test says so, keyed by file name. */
function holdReads() {
  const held = new Map<string, () => void>()
  class HeldReader {
    result: string | null = null
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    error = null
    readAsDataURL(file: File) {
      held.set(file.name, () => {
        this.result = `data:application/pdf;base64,${btoa(file.name)}`
        this.onload?.()
      })
    }
  }
  vi.stubGlobal('FileReader', HeldReader)
  return held
}
afterEach(() => vi.unstubAllGlobals())

test('Submit is disabled while an attachment is being read', async () => {
  const held = holdReads()
  const { user } = await open()
  await fillMinimal(user)
  await user.upload(screen.getByLabelText('Attach a supporting document (optional)'), new File(['x'], 'a.pdf'))
  expect(screen.getByRole('button', { name: 'Submit request' })).toBeDisabled()
  held.get('a.pdf')!()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit request' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Submit request' }))
  await waitFor(() => expect(posts()).toHaveLength(1))
  expect(posts()[0][1]?.body).toMatchObject({ attachment: { name: 'a.pdf' } })
})

test('a stale attachment read does not overwrite a newer pick', async () => {
  const held = holdReads()
  const { user } = await open()
  await fillMinimal(user)
  const input = screen.getByLabelText('Attach a supporting document (optional)')
  await user.upload(input, new File(['x'], 'old.pdf'))
  await user.upload(input, new File(['x'], 'new.pdf'))
  held.get('new.pdf')!()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit request' })).toBeEnabled())
  held.get('old.pdf')!()
  await user.click(screen.getByRole('button', { name: 'Submit request' }))
  await waitFor(() => expect(posts()).toHaveLength(1))
  expect(posts()[0][1]?.body).toMatchObject({ attachment: { name: 'new.pdf' } })
})

test('a Delivery request posts the delivery site as its ship-to code, not the label', async () => {
  const { user } = await open()
  await pick(user, 'Category', 'Delivery')
  await pick(user, 'Request type', 'Concern')
  await user.type(screen.getByLabelText('Trip ID reference'), 'TRP-1')
  await pick(user, 'Related Sales Order', 'SO-100467')
  await pick(user, 'Delivery site (Ship-to Address)', 'PLANT1 — Plant 1 — Main Yard')
  await user.type(screen.getByRole('textbox', { name: 'Request details' }), 'Truck is late')
  await user.click(screen.getByRole('button', { name: 'Submit request' }))
  await waitFor(() => expect(posts()).toHaveLength(1))
  expect(posts()[0][1]?.body).toMatchObject({ category: 'Delivery', fields: { site: 'PLANT1' } })
})
