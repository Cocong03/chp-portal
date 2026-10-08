import { fetchAntiForgeryToken } from '@/auth/session'
import { webApiMocks } from '@/mocks'
import { ApiError, GENERIC_ERROR } from './serverLogic'

/**
 * GET from the Power Pages Web API (portal-owned Dataverse tables; table permissions decide what comes back).
 * `query` is the OData query string without the leading "?". On the dev server it answers from src/mocks.
 */
export async function webApiGet<T>(entitySet: string, query: string): Promise<T[]> {
  if (import.meta.env.DEV) {
    const mock = webApiMocks[entitySet]
    if (!mock) throw new ApiError(404, `No mock for Web API "${entitySet}"`)
    return mock() as T[]
  }
  const response = await fetch(`/_api/${entitySet}?${query}`, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      __RequestVerificationToken: await fetchAntiForgeryToken(),
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!response.ok) throw new ApiError(response.status, GENERIC_ERROR)
  return ((await response.json()) as { value: T[] }).value
}
