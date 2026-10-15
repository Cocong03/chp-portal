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

// Until BC's ledger API exists (S2-07), the deployed site shows the page on the sample entries (client request 2026-10-15).
test('the deployed build shows the Customer Ledger page', async () => {
  vi.stubEnv('DEV', false)
  renderRoute()
  // The lazy page chunk can take over a second to load the first time in Vitest.
  expect(await screen.findByRole('searchbox', { name: 'Search ledger entries' }, { timeout: 5000 })).toBeInTheDocument()
})
