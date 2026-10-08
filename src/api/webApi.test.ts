import { ApiError, GENERIC_ERROR } from './serverLogic'
import { webApiGet } from './webApi'

test('on the dev server it answers from the Web API mocks', async () => {
  const rows = await webApiGet<{ chp_title: string }>('chp_announcements', '$top=1')
  expect(rows[0].chp_title).toBe('Holiday order cutoff schedule')
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

  test('GETs /_api/<entitySet>?<query> with the CSRF headers and returns value[]', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ value: [{ chp_title: 'Hi' }] })))
    expect(await webApiGet('chp_announcements', '$select=chp_title&$top=1')).toEqual([{ chp_title: 'Hi' }])
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/_api/chp_announcements?$select=chp_title&$top=1')
    const headers = new Headers(init?.headers)
    expect(headers.get('__RequestVerificationToken')).toBe('tok123')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
    expect(headers.get('Accept')).toBe('application/json')
  })

  test('a failed call throws ApiError with the generic message', async () => {
    stubFetch(new Response('{"error":{"message":"Forbidden"}}', { status: 403 }))
    const error = (await webApiGet('chp_announcements', '').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(403)
    expect(error.message).toBe(GENERIC_ERROR)
  })
})
