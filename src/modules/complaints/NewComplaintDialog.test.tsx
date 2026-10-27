import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { serverLogic } from '@/api/serverLogic'
import { resetServiceMocks } from '@/mocks/service'
import { renderApp } from '@/test/render'
import { ComplaintsPage } from './ComplaintsPage'
import { NewComplaintDialog } from './NewComplaintDialog'

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
const posts = () => vi.mocked(serverLogic).mock.calls.filter(([name, options]) => name === 'complaints' && options?.method === 'POST')
const CONSENT = /I agree to be contacted/

async function pick(user: User, label: string, option: string) {
  await user.click(await screen.findByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

async function open() {
  const user = userEvent.setup()
  const onClose = vi.fn()
  renderApp(<NewComplaintDialog open onClose={onClose} />)
  await screen.findByRole('combobox', { name: 'Category' })
  return { user, onClose }
}

async function fillMinimal(user: User) {
  await pick(user, 'Category', 'Product Quality')
  await pick(user, 'Complaint type', 'Damaged Bags')
  await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Torn bags')
  await user.click(screen.getByRole('checkbox', { name: CONSENT }))
}

test('shows who is submitting and the account number', async () => {
  await open()
  expect(screen.getByText('Submitted By').nextSibling).toHaveTextContent('J.D. Santos')
  expect(screen.getByText('BC Account Number').nextSibling).toHaveTextContent('10482')
  expect(screen.queryByText(/Must be a user with access/)).toBeNull()
})

test('complaint type and group follow the category', async () => {
  const { user } = await open()
  expect(screen.getByRole('combobox', { name: 'Complaint type' })).toBeDisabled()
  await pick(user, 'Category', 'Billing & Documentation')
  await pick(user, 'Complaint type', 'Incorrect Invoice')
  expect(screen.getByLabelText('Assigned group')).toHaveValue('Finance')
})

test('delivery site shows only for Delivery & Handling, and is cleared when the category changes', async () => {
  const { user } = await open()
  expect(screen.queryByRole('combobox', { name: 'Delivery site (optional)' })).toBeNull()
  await pick(user, 'Category', 'Delivery & Handling')
  await user.click(screen.getByRole('combobox', { name: 'Delivery site (optional)' }))
  const options = await screen.findAllByRole('option')
  expect(options[0]).toHaveTextContent('Not Applicable')
  await user.click(options[1])
  await pick(user, 'Category', 'Product Quality')
  expect(screen.queryByRole('combobox', { name: 'Delivery site (optional)' })).toBeNull()
  await pick(user, 'Complaint type', 'Damaged Bags')
  await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Torn bags')
  await user.click(screen.getByRole('checkbox', { name: CONSENT }))
  await user.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(posts()).toHaveLength(1))
  expect(posts()[0][1]?.body).toMatchObject({ site: '', relatedOrder: '', incidentDate: '', consent: true })
})

test('Submit stays disabled until consent is checked', async () => {
  const { user } = await open()
  const submit = screen.getByRole('button', { name: 'Submit' })
  expect(submit).toBeDisabled()
  await user.click(screen.getByRole('checkbox', { name: CONSENT }))
  expect(submit).toBeEnabled()
})

test('a future incident date is rejected', async () => {
  const { user } = await open()
  await fillMinimal(user)
  await user.click(screen.getByRole('button', { name: /Date of incident/ }))
  await user.click(await screen.findByRole('button', { name: /next month/i }))
  await user.click(await screen.findByRole('button', { name: /15th/ }))
  await user.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText("The date of incident can't be in the future.")).toBeInTheDocument()
  expect(posts()).toHaveLength(0)
})

test('.xlsx is rejected for complaints', async () => {
  await open()
  const user = userEvent.setup({ applyAccept: false })
  await user.upload(screen.getByLabelText('Attach a photo or document (optional)'), new File(['x'], 'sheet.xlsx'))
  expect(await screen.findByText("This file type can't be attached. Use a PDF, Word or image file.")).toBeInTheDocument()
})

test('required fields block submit with messages', async () => {
  const { user } = await open()
  await user.click(screen.getByRole('checkbox', { name: CONSENT }))
  await user.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText('Select a category.')).toBeInTheDocument()
  expect(screen.getByText('Enter a subject.')).toBeInTheDocument()
  expect(posts()).toHaveLength(0)
})

test('double click posts once', async () => {
  const { user } = await open()
  await fillMinimal(user)
  let release: () => void = () => {}
  vi.mocked(serverLogic).mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ ref: 'CMP-1' }))) as never)
  const submit = screen.getByRole('button', { name: 'Submit' })
  await user.dblClick(submit)
  expect(submit).toBeDisabled()
  expect(posts()).toHaveLength(1)
  release()
  await waitFor(() => expect(toast.success).toHaveBeenCalled())
})

test('success closes and the complaint is listed as Submitted', async () => {
  const user = userEvent.setup()
  renderApp(<ComplaintsPage />)
  await screen.findAllByRole('row')
  await user.click(screen.getByRole('button', { name: 'New complaint' }))
  await fillMinimal(user)
  await user.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Complaint CMP-20106 submitted.'))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New submission' })).toBeNull())
  await waitFor(() => expect(screen.getAllByRole('row')[1]).toHaveTextContent('CMP-20106'))
  expect(within(screen.getAllByRole('row')[1]).getByText('Submitted')).toBeInTheDocument()
})

test('a saved complaint whose number could not be read back still confirms and closes', async () => {
  const { user, onClose } = await open()
  await fillMinimal(user)
  vi.mocked(serverLogic).mockImplementationOnce(async () => ({ ref: '' }) as never)
  await user.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Complaint submitted.'))
  expect(onClose).toHaveBeenCalled()
})

test('a Delivery & Handling complaint posts the delivery site as its ship-to code, not the label', async () => {
  const { user } = await open()
  await pick(user, 'Category', 'Delivery & Handling')
  await pick(user, 'Complaint type', 'Missing Bags (Short Delivery)')
  await pick(user, 'Delivery site (optional)', 'PLANT1 — Plant 1 — Main Yard')
  await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Short delivery')
  await user.click(screen.getByRole('checkbox', { name: CONSENT }))
  await user.click(screen.getByRole('button', { name: 'Submit' }))
  await waitFor(() => expect(posts()).toHaveLength(1))
  expect(posts()[0][1]?.body).toMatchObject({ category: 'Delivery & Handling', site: 'PLANT1', consent: true })
})
