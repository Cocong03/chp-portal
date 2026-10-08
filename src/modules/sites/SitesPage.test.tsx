import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, serverLogic } from '@/api/serverLogic'
import { renderApp } from '@/test/render'
import { SitesPage } from './SitesPage'

vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const table = () => screen.findByRole('table', { name: 'Active delivery sites' })
const count = () => screen.getByText(/^Showing/)

test("shows the account's delivery sites in the wireframe columns, with the default flagged", async () => {
  renderApp(<SitesPage />)
  const sites = await table()
  await within(sites).findByRole('row', { name: /PLANT1/ })
  expect(within(sites).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
    'Ship-to Address Code',
    'Address',
    'Contact',
    'Phone',
    'Default',
  ])
  const plant1 = within(sites).getByRole('row', { name: /PLANT1/ })
  expect(within(plant1).getByText('Plant 1 — Main Yard')).toBeInTheDocument()
  expect(within(plant1).getByText('Default')).toBeInTheDocument()
  expect(within(within(sites).getByRole('row', { name: /PLANT2/ })).queryByText('Default')).not.toBeInTheDocument()
  expect(count()).toHaveTextContent('Showing 3 delivery sites.')
  expect(document.title).toBe('Delivery Sites — Concreat Connect')
})

test('search narrows the list and Clear filters brings it back', async () => {
  const user = userEvent.setup()
  renderApp(<SitesPage />)
  await within(await table()).findByRole('row', { name: /PLANT1/ })
  await user.type(screen.getByRole('searchbox', { name: 'Search delivery sites' }), 'bulacan')
  expect(count()).toHaveTextContent('Showing 1 delivery sites.')
  expect(screen.queryByRole('row', { name: /PLANT1/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByRole('searchbox', { name: 'Search delivery sites' })).toHaveValue('')
  expect(count()).toHaveTextContent('Showing 3 delivery sites.')
})

test('a search with no match says so', async () => {
  const user = userEvent.setup()
  renderApp(<SitesPage />)
  await within(await table()).findByRole('row', { name: /PLANT1/ })
  await user.type(screen.getByRole('searchbox', { name: 'Search delivery sites' }), 'cebu')
  expect(screen.getByRole('cell', { name: 'No delivery sites match your search.' })).toBeInTheDocument()
})

test('an account without ship-tos says none are registered', async () => {
  vi.mocked(serverLogic).mockResolvedValueOnce([])
  renderApp(<SitesPage />)
  expect(await screen.findByRole('cell', { name: 'No delivery sites are registered on your account yet.' })).toBeInTheDocument()
})

test('a failed load shows the error and Try again reloads', async () => {
  const user = userEvent.setup()
  vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(500, 'x'))
  renderApp(<SitesPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this information. Please try again.")
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await within(await table()).findByRole('row', { name: /PLANT1/ })).toBeInTheDocument()
})
