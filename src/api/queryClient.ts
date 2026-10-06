import { QueryCache, QueryClient, type QueryClientConfig } from '@tanstack/react-query'
import { BlockedError } from './serverLogic'

/** The app's QueryClient. A blocked answer from any data query re-checks `me`, whose BlockedError shows the card. */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  const client = new QueryClient({
    ...config,
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (error instanceof BlockedError && query.queryKey[0] !== 'me') void client.invalidateQueries({ queryKey: ['me'] })
      },
    }),
  })
  return client
}
