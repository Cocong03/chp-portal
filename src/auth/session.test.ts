import { go } from '@/lib/go'
import {
  checkActivationLink,
  getPortalUser,
  InvalidInvitationError,
  InvalidResetLinkError,
  MOCK_SESSION_KEY,
  redeemInvitation,
  requestActivation,
  requestPasswordReset,
  resetPassword,
  signIn,
  signOut,
} from './session'

vi.mock('@/lib/go', () => ({ go: vi.fn() }))

const TOKEN_PAGE = '<input name="__RequestVerificationToken" type="hidden" value="tok123" />'

afterEach(() => {
  delete window.Microsoft
})

describe('on the dev server (mock session)', () => {
  test('signIn stores the normalized email and reloads to /', async () => {
    await signIn(' Finance@Test.PH ', 'anything')
    expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBe('finance@test.ph')
    expect(getPortalUser()?.email).toBe('finance@test.ph')
    expect(go).toHaveBeenCalledWith('/')
  })

  test('signOut clears the mock session', () => {
    sessionStorage.setItem(MOCK_SESSION_KEY, 'full@test.ph')
    signOut()
    expect(getPortalUser()).toBeUndefined()
    expect(go).toHaveBeenCalledWith('/')
  })

  test('redeemInvitation with the "expired" code simulates a rejected link', async () => {
    await expect(redeemInvitation('expired', 'jd@x.ph', 'Abcdefg1', 'Abcdefg1')).rejects.toBeInstanceOf(InvalidInvitationError)
  })

  test('requestActivation simulates each outcome by email', async () => {
    expect(await requestActivation('multi@test.ph')).toBe('needs_help')
    expect(await requestActivation('active@test.ph')).toBe('already_active')
    expect(await requestActivation('jd@x.ph')).toBe('ok')
  })
})

describe('on the deployed site', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
  })

  test('getPortalUser reads Portal.User and treats an empty userName as anonymous', () => {
    window.Microsoft = {
      Dynamic365: { Portal: { User: { userName: '', firstName: '', lastName: '', email: '', contactId: '', userRoles: [] } } },
    }
    expect(getPortalUser()).toBeUndefined()
    window.Microsoft.Dynamic365!.Portal!.User!.userName = 'jd@x.ph'
    expect(getPortalUser()?.userName).toBe('jd@x.ph')
  })

  test('signIn posts Email + PasswordValue with the CSRF token and reloads on success', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/_layout/tokenhtml'
        ? new Response(TOKEN_PAGE)
        : ({ url: 'https://site.example/', text: async () => '' } as Response),
    )
    vi.stubGlobal('fetch', fetchMock)

    await signIn('jd@x.ph', 'S3cret!')

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/SignIn')
    const body = init!.body as URLSearchParams
    expect(body.get('Email')).toBe('jd@x.ph')
    expect(body.get('PasswordValue')).toBe('S3cret!')
    expect(body.get('__RequestVerificationToken')).toBe('tok123')
    expect(body.get('ReturnUrl')).toBe('/')
    expect(go).toHaveBeenCalledWith('/')
  })

  // Power Pages answers every failed sign-in (wrong password, unknown email, locked) with "Invalid sign-in attempt."
  test('signIn turns the Power Pages "Invalid sign-in attempt." into plain wording', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/_layout/tokenhtml'
          ? new Response(TOKEN_PAGE)
          : ({
              url: 'https://site.example/SignIn',
              text: async () => '<div class="validation-summary-errors"><ul><li>Invalid sign-in attempt.</li></ul></div>',
            } as Response),
      ),
    )
    await expect(signIn('jd@x.ph', 'wrong')).rejects.toThrow('Incorrect email or password. Please try again.')
    expect(go).not.toHaveBeenCalled()
  })

  test.each([
    ['signIn', () => signIn('jd@x.ph', 'S3cret!')],
    ['redeemInvitation', () => redeemInvitation('code', 'jd@x.ph', 'Abcdefg1', 'Abcdefg1')],
  ])('%s turns a browser network failure into customer copy', async (_name, call) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/_layout/tokenhtml') return new Response(TOKEN_PAGE)
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(call()).rejects.toThrow("We couldn't reach the sign-in service. Please try again.")
  })

  test('redeemInvitation rejects an invitation the server no longer offers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body><p>Not found</p></body></html>')))
    await expect(redeemInvitation('used-code', 'jd@x.ph', 'Abcdefg1', 'Abcdefg1')).rejects.toBeInstanceOf(InvalidInvitationError)
  })

  // Captured on the Dev site 2026-10-04: a used code still gets the Register form on GET;
  // the POST re-renders it with this validation summary.
  test('redeemInvitation maps "Invalid invitation code." after the POST to InvalidInvitationError', async () => {
    const registerPage =
      '<form id="Register" action="./Register?x=1"><input id="__VIEWSTATE" value="vs" />' +
      '<input id="EmailTextBox" name="ctl00$Email" /><input id="PasswordTextBox" name="ctl00$Pw" />' +
      '<input id="ConfirmPasswordTextBox" name="ctl00$Pw2" /><input id="SubmitButton" name="ctl00$Go" value="Register" /></form>'
    const rejected =
      '<div id="ValidationSummary1" class="validation-summary-errors listStyleTypeNone alert alert-block alert-danger"> <ul><li>Invalid invitation code.</li></ul> </div>'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? ({ redirected: false, url: 'https://site.example/Account/Login/Register', text: async () => rejected } as Response)
          : new Response(registerPage),
      ),
    )
    await expect(redeemInvitation('used-code', 'jd@x.ph', 'Abcdefg1', 'Abcdefg1')).rejects.toBeInstanceOf(InvalidInvitationError)
  })

  test('requestActivation fails cleanly until the flow id is configured', async () => {
    vi.stubEnv('VITE_ACTIVATION_FLOW_ID', '')
    await expect(requestActivation('jd@x.ph')).rejects.toThrow("We couldn't send the activation email right now.")
  })

  test('requestActivation posts the email to the flow trigger with CSRF headers and returns its status', async () => {
    vi.stubEnv('VITE_ACTIVATION_FLOW_ID', 'flow-1')
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response('{"status":"already_active"}'),
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await requestActivation('jd@x.ph')).toBe('already_active')

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/_api/cloudflow/v1.0/trigger/flow-1')
    expect(JSON.parse(init!.body as string)).toEqual({ eventData: JSON.stringify({ Email: 'jd@x.ph' }) })
    const headers = new Headers(init!.headers)
    expect(headers.get('__RequestVerificationToken')).toBe('tok123')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
  })

  test.each([['{}'], ['{"status":"something-new"}'], ['not json']])('an unknown reply %s counts as ok', async (reply) => {
    vi.stubEnv('VITE_ACTIVATION_FLOW_ID', 'flow-1')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response(reply))))
    expect(await requestActivation('jd@x.ph')).toBe('ok')
  })

  test('checkActivationLink posts the code and returns valid or invalid', async () => {
    vi.stubEnv('VITE_CHECK_LINK_FLOW_ID', 'flow-2')
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response('{"status":"invalid"}'),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await checkActivationLink('abc')).toBe('invalid')
    expect(fetchMock.mock.calls[1][0]).toBe('/_api/cloudflow/v1.0/trigger/flow-2')
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ eventData: JSON.stringify({ Code: 'abc' }) })
  })

  test('checkActivationLink fails when the check flow is unavailable', async () => {
    vi.stubEnv('VITE_CHECK_LINK_FLOW_ID', 'flow-2')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response('', { status: 502 }))))
    await expect(checkActivationLink('abc')).rejects.toThrow()
  })

  test('requestPasswordReset posts the email to the built-in ForgotPassword form', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => (url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response('')))
    vi.stubGlobal('fetch', fetchMock)
    await requestPasswordReset('jd@x.ph')
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/Account/Login/ForgotPassword')
    const body = init!.body as URLSearchParams
    expect(body.get('Email')).toBe('jd@x.ph')
    expect(body.get('__RequestVerificationToken')).toBe('tok123')
  })

  // Seen on Dev 2026-10-06: the built-in form answered 200 with "An unknown failure has occurred. Error ID # […]".
  test('requestPasswordReset reports a failure the built-in form shows instead of claiming success', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/_layout/tokenhtml'
        ? new Response(TOKEN_PAGE)
        : ({
            ok: true, redirected: false, url: 'https://s/Account/Login/ForgotPassword',
            text: async () => '<div class="validation-summary-errors"><ul><li>An unknown failure has occurred. Error ID # [9a7e]</li></ul></div>',
          } as Response),
    ))
    await expect(requestPasswordReset('jd@x.ph')).rejects.toThrow("We couldn't send the reset email right now. Please try again in a few minutes.")
  })

  test('resetPassword posts UserId, Code and both passwords, and succeeds on the redirect', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : ({ redirected: true, url: 'https://s/Account/Login/ResetPasswordConfirmation', text: async () => '' } as Response),
    )
    vi.stubGlobal('fetch', fetchMock)
    await resetPassword('u-1', 'c+1', 'Abcdefg1', 'Abcdefg1')
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/Account/Login/ResetPassword')
    const body = init!.body as URLSearchParams
    expect([body.get('UserId'), body.get('Code'), body.get('Password'), body.get('ConfirmPassword')]).toEqual(['u-1', 'c+1', 'Abcdefg1', 'Abcdefg1'])
  })

  test('resetPassword maps "Invalid token." to InvalidResetLinkError', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/_layout/tokenhtml'
        ? new Response(TOKEN_PAGE)
        : ({ redirected: false, url: 'https://s/Account/Login/ResetPassword', text: async () => '<div class="validation-summary-errors"><ul><li>Invalid token.</li></ul></div>' } as Response),
    ))
    await expect(resetPassword('u', 'c', 'Abcdefg1', 'Abcdefg1')).rejects.toBeInstanceOf(InvalidResetLinkError)
  })
})
