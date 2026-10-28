import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '@/api/queryClient'
import { MemoryRouter, type InitialEntry } from 'react-router-dom'

/** Renders with the app's providers. Each call gets a fresh QueryClient so tests share no cache. */
export function renderApp(ui: ReactElement, { route = '/' }: { route?: InitialEntry } = {}) {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...result, client }
}
