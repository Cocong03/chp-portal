import { QueryCache, QueryClient, type QueryClientConfig } from '@tanstack/react-query'
import { BlockedError } from './serverLogic'

/**
 * The app's QueryClient. A blocked answer from any data query re-checks a loaded `me`, whose BlockedError shows the card.
 * A `me` without data is skipped: it is still loading (its own answer decides) or has failed already, and re-checking it
 * would reset it to loading, which renders the hidden page again and loops (seen on Dev 2026-10-18).
 */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  const client = new QueryClient({
    ...config,
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (error instanceof BlockedError && query.queryKey[0] !== 'me' && client.getQueryData(['me']) !== undefined)
          void client.invalidateQueries({ queryKey: ['me'] })
      },
    }),
  })
  return client
}
