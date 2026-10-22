import { MOCK_SESSION_KEY } from '@/auth/session'
import { ApiError, BlockedError, GENERIC_ERROR, serverLogic } from './serverLogic'
import type { CompanyDto, MeDto, OrderDto, OrdersPageDto, SiteDto } from './types'

const caught = async (promise: Promise<unknown>) => (await promise.catch((error: unknown) => error)) as ApiError

describe('on the dev server', () => {
  test('serves the me fixture for the signed-in mock email, ignoring case and spaces', async () => {
    sessionStorage.setItem(MOCK_SESSION_KEY, ' Finance@Test.PH ')
    const me = await serverLogic<MeDto>('me')
    expect(me.roles).toEqual(['Authenticated Users', 'Finance & Documents'])
    expect(me.account).toEqual({
      customerNo: '10482',
      customerName: 'J.D. Santos Hardware & Construction Supply',
      company: 'Solid Cement',
    })
  })

  test('norole@test.ph has no business role', async () => {
    sessionStorage.setItem(MOCK_SESSION_KEY, 'norole@test.ph')
    expect((await serverLogic<MeDto>('me')).roles).toEqual(['Authenticated Users'])
  })

  test('an unknown email falls back to Full Access', async () => {
    sessionStorage.setItem(MOCK_SESSION_KEY, 'someone@else.ph')
    expect((await serverLogic<MeDto>('me')).roles).toContain('Full Access')
  })

  test('serves the company fixture', async () => {
    sessionStorage.setItem(MOCK_SESSION_KEY, 'full@test.ph')
    expect((await serverLogic<CompanyDto>('company')).customerNo).toBe('10482')
  })

  test('serves the sites fixture from the wireframe SITES', async () => {
    const sites = await serverLogic<SiteDto[]>('sites')
    expect(sites.map((s) => s.code)).toEqual(['PLANT1', 'PLANT2', 'PLANT3'])
    expect(sites[0].isDefault).toBe(true)
  })

  test('the company fixture carries the wireframe PORTAL_CONTACTS', async () => {
    const company = await serverLogic<CompanyDto>('company')
    expect(company.website).toBe('www.jdsantoshardware.ph')
    expect(company.contacts.map((c) => c.name)).toEqual(['J.D. Santos', 'Elena Ramos', 'Miguel Torres', 'Grace Villanueva'])
  })

  test('the orders mock pages the wireframe ORDERS newest first and filters like the endpoint', async () => {
    const first = await serverLogic<OrdersPageDto>('orders', { query: {} })
    expect(first).toMatchObject({ total: 14, page: 1, pageSize: 10 })
    expect(first.orders[0].so).toBe('SO-100482')
    expect((await serverLogic<OrdersPageDto>('orders', { query: { page: '2' } })).orders).toHaveLength(4)
    expect((await serverLogic<OrdersPageDto>('orders', { query: { status: 'Open' } })).orders.map((o) => o.so)).toEqual(['SO-100467'])
    expect((await serverLogic<OrdersPageDto>('orders', { query: { q: 'po-8841' } })).orders.map((o) => o.so)).toEqual(['SO-100482'])
  })

  test('the orders mock answers detail by id, and notFound for an unknown id', async () => {
    const order = await serverLogic<OrderDto>('orders', { query: { id: 'SO-100482' } })
    expect(order.lines[0]).toMatchObject({ code: 'CEM-T1-40KG', qty: 600, uom: 'BAG' })
    expect(order.total).toBe(order.lines.reduce((sum, l) => sum + l.lineTotal, 0))
    expect(await serverLogic('orders', { query: { id: 'SO-1' } })).toEqual({ notFound: true })
  })

  test('an endpoint without a mock is a 404 ApiError', async () => {
    const error = await caught(serverLogic('nope'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
  })
  test('a blocked answer becomes a BlockedError', async () => {
    sessionStorage.setItem(MOCK_SESSION_KEY, 'blocked@test.ph')
    await expect(serverLogic('me')).rejects.toBeInstanceOf(BlockedError)
  })
})

describe('on the deployed site', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
  })

  function stubFetch(response: Response) {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/_layout/tokenhtml' ? new Response('<input type="hidden" value="tok123" />') : response,
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  test('the Customer Ledger calls its Server Logic now that BC has the ledger API (S2-07)', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ Success: true, Data: JSON.stringify({ total: 7 }) })))
    const data = await serverLogic<{ total: number }>('ledger', { query: { show: 'all' } })
    expect(data.total).toBe(7)
    expect(fetchMock.mock.calls[1][0]).toBe('/_api/serverlogics/ledger?show=all')
  })

  test('GET calls /_api/serverlogics/<name> with the query and CSRF headers and unwraps Data', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ Success: true, Data: JSON.stringify({ hello: 'world' }) })))

    const data = await serverLogic<{ hello: string }>('orders', { query: { page: '2', q: "O'Neil" } })

    expect(data).toEqual({ hello: 'world' })
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/_api/serverlogics/orders?page=2&q=O%27Neil')
    expect(init?.method).toBe('GET')
    expect(init?.body).toBeUndefined()
    const headers = new Headers(init?.headers)
    expect(headers.get('__RequestVerificationToken')).toBe('tok123')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
  })

  test('POST sends the body as JSON', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ Success: true, Data: '{}' })))
    await serverLogic('orders', { method: 'POST', body: { qty: 2 } })
    const [, init] = fetchMock.mock.calls[1]
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ qty: 2 })
  })

  test('a failed envelope throws ApiError with its message', async () => {
    stubFetch(new Response(JSON.stringify({ Success: false, Error: { Message: 'Not allowed' } }), { status: 403 }))
    const error = await caught(serverLogic('orders'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(403)
    expect(error.message).toBe('Not allowed')
  })

  // Shape observed on the Dev site, 2026-10-04: lowercase keys (Microsoft Learn shows PascalCase).
  test('unwraps the lowercase envelope the runtime actually returns', async () => {
    stubFetch(new Response(JSON.stringify({ requestId: 'r-1', success: true, serverLogicName: 'me', data: JSON.stringify({ ok: 1 }) })))
    expect(await serverLogic('me')).toEqual({ ok: 1 })
  })

  test('a lowercase failure envelope throws ApiError with its status', async () => {
    stubFetch(
      new Response(JSON.stringify({ requestId: 'r-1', success: false, serverLogicName: 'me', error: 'Exception occurred while processing this request' }), {
        status: 400,
      }),
    )
    const error = await caught(serverLogic('me'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
  })

  test('a non-JSON gateway page throws a generic ApiError instead of crashing', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }))
    const error = await caught(serverLogic('orders'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.message).toBe(GENERIC_ERROR)
  })
  test('a {blocked:true} reply from the server becomes a BlockedError', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/_layout/tokenhtml'
        ? new Response('<input name="__RequestVerificationToken" value="t" />')
        : new Response(JSON.stringify({ success: true, data: '{"blocked":true}' })),
    ))
    const error = await serverLogic('company').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BlockedError)
    expect((error as BlockedError).status).toBe(403)
  })
})
