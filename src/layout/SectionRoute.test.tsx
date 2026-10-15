import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { createQueryClient } from '@/api/queryClient'
import type { MeDto } from '@/api/types'
import { SECTIONS } from './sections'
import { SectionRoute } from './SectionRoute'

const ME: MeDto = {
  contact: { name: 'J.D. Santos', email: 'full@test.ph' },
  account: { customerNo: '10482', customerName: 'J.D. Santos Hardware & Construction Supply', company: 'Solid Cement' },
  roles: ['Full Access'],
}
const ledger = SECTIONS.find((s) => s.key === 'ledger')!
// Load the lazy Ledger chunk up front: its first load under a busy full-suite run took over 5 s (2026-10-15).
beforeAll(() => import('@/modules/ledger/LedgerPage'), 30_000)

function renderRoute() {
  const client = createQueryClient()
  client.setQueryData(['me'], ME)
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/ledger']}>
        <SectionRoute section={ledger} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Until BC's ledger API exists (S2-07), the deployed site keeps the placeholder; the page runs only locally.
test('the deployed build keeps "coming soon" on the Customer Ledger', async () => {
  vi.stubEnv('DEV', false)
  renderRoute()
  expect(await screen.findByText('This section is coming soon.')).toBeInTheDocument()
})

test('the local build shows the Customer Ledger page', async () => {
  renderRoute()
  // The lazy page chunk can take over a second to load the first time in Vitest.
  expect(await screen.findByRole('searchbox', { name: 'Search ledger entries' }, { timeout: 5000 })).toBeInTheDocument()
})
