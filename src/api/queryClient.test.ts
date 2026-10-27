import { BlockedError } from './serverLogic'
import { createQueryClient } from './queryClient'

test('a blocked answer from a data query re-checks a loaded me', async () => {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['me'], { contact: { name: 'J.D. Santos', email: 'full@test.ph' }, account: null, roles: [] })
  const spy = vi.spyOn(client, 'invalidateQueries')
  await client.fetchQuery({ queryKey: ['company'], queryFn: () => Promise.reject(new BlockedError()) }).catch(() => {})
  expect(spy).toHaveBeenCalledWith({ queryKey: ['me'] })
})

test('a blocked me does not re-check itself (no loop)', async () => {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  await client.fetchQuery({ queryKey: ['me'], queryFn: () => Promise.reject(new BlockedError()) }).catch(() => {})
  expect(spy).not.toHaveBeenCalled()
})
