import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { CompanyDto } from '@/api/types'
import { mocks } from '@/mocks'
import { renderApp } from '@/test/render'
import { AccountPage } from './AccountPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const fixture = () => mocks.company!({ method: 'GET' }) as CompanyDto
const contactsTable = () => screen.findByRole('table', { name: 'Contacts and portal access' })

test('shows the company information from BC', async () => {
  renderApp(<AccountPage />)
  await screen.findByText('10482')
  // dt/dd pairs: read each term with the definition that follows it.
  expect(screen.getAllByRole('term').map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])).toEqual([
    ['Customer Number', '10482'],
    ['Company Name', 'J.D. Santos Hardware & Construction Supply'],
    ['Address', 'Blk 12 Lot 4, National Highway, Brgy. San Isidro, Cabuyao, Laguna'],
    ['Website', 'www.jdsantoshardware.ph'],
    ['VAT Registration Number', '123-456-789-000'],
  ])
  expect(document.title).toBe('Account and User Management — Concreat Connect')
})

test('a missing website shows a dash', async () => {
  vi.mocked(serverLogic).mockResolvedValueOnce({ ...fixture(), website: '' })
  renderApp(<AccountPage />)
  await screen.findByText('10482')
  const website = screen.getAllByRole('term').find((dt) => dt.textContent === 'Website')!
  expect(website.nextElementSibling).toHaveTextContent('—')
})

test('lists contacts with You, portal access and permissions as in the wireframe', async () => {
  renderApp(<AccountPage />)
  const contacts = await contactsTable()
  const you = await within(contacts).findByRole('row', { name: /J\.D\. Santos/ })
  expect(within(contacts).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Name',
    'Title',
    'Phone',
    'Email',
    'Portal access',
    'Permissions',
    'Actions',
  ])
  expect(within(you).getByText('You')).toBeInTheDocument()
  expect(within(you).getByText('Yes')).toBeInTheDocument()
  expect(within(you).getByText('Full Access')).toBeInTheDocument()
  const grace = within(contacts).getByRole('row', { name: /Grace Villanueva/ })
  expect(within(grace).getByText('No')).toBeInTheDocument()
  expect(within(grace).queryByText('You')).not.toBeInTheDocument()
  expect(within(grace).getAllByText('—')).toHaveLength(2) // Permissions and Actions
})

test('hovering a role lists the sections it can see', async () => {
  const user = userEvent.setup()
  renderApp(<AccountPage />)
  await user.hover(await screen.findByText('Finance & Documents'))
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'Can see: Dashboard, Customer Ledger, Document Center, Account and User Management',
  )
})

test('an account without contacts says none are registered', async () => {
  vi.mocked(serverLogic).mockResolvedValueOnce({ ...fixture(), contacts: [] })
  renderApp(<AccountPage />)
  expect(await screen.findByRole('cell', { name: 'No contacts are registered on your account yet.' })).toBeInTheDocument()
})

test('a failed load shows the error and Try again reloads', async () => {
  const user = userEvent.setup()
  vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(500, 'x'))
  renderApp(<AccountPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await within(await contactsTable()).findByRole('row', { name: /J\.D\. Santos/ })).toBeInTheDocument()
})
