import { go } from '@/lib/go'

// Power Pages local authentication (Registration doc §4.1 and §5). The dev server uses a mock session instead.

export interface PortalUser {
  userName: string
  firstName: string
  lastName: string
  email: string
  contactId: string
  userRoles: string[]
}

declare global {
  interface Window {
    Microsoft?: { Dynamic365?: { Portal?: { User?: PortalUser } } }
  }
}

/** sessionStorage key holding the signed-in mock email on the dev server. */
export const MOCK_SESSION_KEY = 'concreat.mockSession'

const SIGN_IN_FAILED = 'Incorrect email or password. Please try again.'
const SERVICE_UNREACHABLE = "We couldn't reach the sign-in service. Please try again."
const ACTIVATION_FAILED =
  "We couldn't activate your account. Please try again, or contact the Concreat Customer Service Center at (02) 8849-3600."
const ACTIVATION_SEND_FAILED = "We couldn't send the activation email right now. Please try again in a few minutes."

export class InvalidInvitationError extends Error {
  constructor() {
    super('This activation link is invalid, has already been used, or has expired.')
    this.name = 'InvalidInvitationError'
  }
}

// Browser network errors ("Failed to fetch") aren't customer copy.
async function send(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch {
    throw new Error(SERVICE_UNREACHABLE)
  }
}

export function getPortalUser(): PortalUser | undefined {
  if (import.meta.env.DEV) {
    const email = sessionStorage.getItem(MOCK_SESSION_KEY)
    return email
      ? {
          userName: email,
          firstName: 'J.D.',
          lastName: 'Santos',
          email,
          contactId: '00000000-0000-0000-0000-000000000001',
          userRoles: ['Authenticated Users'],
        }
      : undefined
  }
  const user = window.Microsoft?.Dynamic365?.Portal?.User
  return user?.userName ? user : undefined
}

// ponytail: token fetched per request; cache it per page load if the extra round trip shows up in S2 timings.
export async function fetchAntiForgeryToken(): Promise<string> {
  const response = await send('/_layout/tokenhtml', { credentials: 'same-origin' })
  const token = response.ok ? (await response.text()).match(/value="([^"]+)"/)?.[1] : undefined
  if (!token) throw new Error(SERVICE_UNREACHABLE)
  return token
}

/** Form POST to /SignIn. The password field is PasswordValue, not Password. */
export async function signIn(email: string, password: string): Promise<void> {
  if (import.meta.env.DEV) {
    sessionStorage.setItem(MOCK_SESSION_KEY, email.trim().toLowerCase())
    go('/')
    return
  }
  const response = await send('/SignIn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'same-origin',
    body: new URLSearchParams({
      __RequestVerificationToken: await fetchAntiForgeryToken(),
      Email: email,
      PasswordValue: password,
      ReturnUrl: '/',
    }),
  })
  // Success follows the redirect to ReturnUrl; failure re-renders /SignIn with validation errors.
  if (new URL(response.url).pathname === '/') {
    go('/') // full reload so Portal.User is populated
    return
  }
  const errors = parseServerErrors(await response.text())
  // Power Pages uses "Invalid sign-in attempt." for wrong password, unknown email and locked/deactivated contacts.
  if (errors.length === 0 || errors.some((message) => /invalid sign-in attempt/i.test(message))) throw new Error(SIGN_IN_FAILED)
  throw new Error(errors.join(' '))
}

/**
 * Redeems an activation invitation. /Account/Login/Register is a Web Forms page, so fetch it,
 * copy its ViewState and control names, and post it back.
 */
export async function redeemInvitation(code: string, email: string, password: string, confirmPassword: string): Promise<void> {
  if (import.meta.env.DEV) {
    if (code === 'expired') throw new InvalidInvitationError()
    sessionStorage.setItem(MOCK_SESSION_KEY, email.trim().toLowerCase())
    go('/')
    return
  }
  const pageResponse = await send(`/Account/Login/Register?${new URLSearchParams({ returnUrl: '/', invitationCode: code })}`, {
    credentials: 'same-origin',
  })
  if (!pageResponse.ok) throw new Error(SERVICE_UNREACHABLE)
  const doc = new DOMParser().parseFromString(await pageResponse.text(), 'text/html')
  const form = doc.getElementById('Register')
  if (!form) throw new InvalidInvitationError()

  // A relative action ("./Register?…") resolves against /Account/Login/, not the SPA path.
  const action = new URL(form.getAttribute('action') || 'Register', new URL('/Account/Login/', window.location.origin))
  const valueOf = (selector: string) => doc.querySelector<HTMLInputElement>(selector)?.value ?? ''
  const body = new URLSearchParams({
    __VIEWSTATE: valueOf('#__VIEWSTATE'),
    __VIEWSTATEGENERATOR: valueOf('#__VIEWSTATEGENERATOR'),
    __VIEWSTATEENCRYPTED: '',
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
  })
  for (const name of ['__EVENTVALIDATION', '__RequestVerificationToken']) {
    const value = valueOf(`input[name="${name}"]`)
    if (value) body.set(name, value)
  }
  const fields: [string, string][] = [
    ['EmailTextBox', email],
    ['PasswordTextBox', password],
    ['ConfirmPasswordTextBox', confirmPassword],
  ]
  for (const [id, value] of fields) {
    const name = doc.getElementById(id)?.getAttribute('name')
    if (name) body.set(name, value)
  }
  const submit = doc.querySelector<HTMLInputElement>('#SubmitButton')
  if (submit) body.set(submit.name, submit.value || 'Register')

  const response = await send(action.pathname + action.search, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'same-origin',
    body,
  })
  if (response.redirected) {
    go(response.url)
    return
  }
  const errors = parseServerErrors(await response.text())
  // A used or expired code still gets the form; the POST answers "Invalid invitation code." (seen on Dev 2026-10-04).
  if (errors.some((message) => /invitation code/i.test(message))) throw new InvalidInvitationError()
  throw new Error(errors.join(' ') || ACTIVATION_FAILED)
}

export type ActivationStatus = 'ok' | 'needs_help' | 'already_active'
const ACTIVATION_STATUSES: ActivationStatus[] = ['ok', 'needs_help', 'already_active']

/** Posts one input to a Power Pages cloud flow and returns its reply's `status` (undefined if absent). */
async function triggerFlow(flowId: string | undefined, input: Record<string, string>): Promise<string | undefined> {
  if (!flowId) throw new Error(ACTIVATION_SEND_FAILED)
  const response = await send(`/_api/cloudflow/v1.0/trigger/${flowId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      __RequestVerificationToken: await fetchAntiForgeryToken(),
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'same-origin',
    // The eventData key must equal the flow trigger input's title.
    body: JSON.stringify({ eventData: JSON.stringify(input) }),
  })
  if (!response.ok) throw new Error(ACTIVATION_SEND_FAILED)
  const reply = (await response.json().catch(() => undefined)) as { status?: unknown } | undefined
  return typeof reply?.status === 'string' ? reply.status : undefined
}

/**
 * Triggers the "Request activation" cloud flow. Unknown emails get "ok" like a sent invitation, so the
 * page can't be used to discover which emails belong to a customer (spec D "middle ground").
 */
export async function requestActivation(email: string): Promise<ActivationStatus> {
  if (import.meta.env.DEV) {
    await new Promise((resolve) => setTimeout(resolve, 600))
    const address = email.trim().toLowerCase()
    return address === 'multi@test.ph' ? 'needs_help' : address === 'active@test.ph' ? 'already_active' : 'ok'
  }
  const status = await triggerFlow(import.meta.env.VITE_ACTIVATION_FLOW_ID, { Email: email })
  return ACTIVATION_STATUSES.includes(status as ActivationStatus) ? (status as ActivationStatus) : 'ok'
}

/** Asks the "Check activation link" flow whether an activation code can still be used. */
export async function checkActivationLink(code: string): Promise<'valid' | 'invalid'> {
  if (import.meta.env.DEV) return code === 'expired' ? 'invalid' : 'valid'
  return (await triggerFlow(import.meta.env.VITE_CHECK_LINK_FLOW_ID, { Code: code })) === 'valid' ? 'valid' : 'invalid'
}

export class InvalidResetLinkError extends Error {
  constructor() {
    super('This reset link is invalid or has expired.')
    this.name = 'InvalidResetLinkError'
  }
}

/** Starts Power Pages' password reset. The reply is neutral whether or not the email has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  if (import.meta.env.DEV) {
    await new Promise((resolve) => setTimeout(resolve, 600))
    return
  }
  const response = await send('/Account/Login/ForgotPassword', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'same-origin',
    body: new URLSearchParams({ __RequestVerificationToken: await fetchAntiForgeryToken(), Email: email }),
  })
  if (!response.ok) throw new Error(SERVICE_UNREACHABLE)
}

/** Completes a reset from the emailed link. Success redirects; failure re-renders the built-in form with errors. */
export async function resetPassword(userId: string, code: string, password: string, confirmPassword: string): Promise<void> {
  if (import.meta.env.DEV) {
    if (code === 'expired') throw new InvalidResetLinkError()
    return
  }
  const response = await send('/Account/Login/ResetPassword', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'same-origin',
    body: new URLSearchParams({
      __RequestVerificationToken: await fetchAntiForgeryToken(),
      UserId: userId,
      Code: code,
      Password: password,
      ConfirmPassword: confirmPassword,
    }),
  })
  if (response.redirected) return
  const errors = parseServerErrors(await response.text())
  if (errors.length === 0 || errors.some((message) => /token/i.test(message))) throw new InvalidResetLinkError()
  throw new Error(errors.join(' '))
}

export function signOut(): void {
  if (import.meta.env.DEV) {
    sessionStorage.removeItem(MOCK_SESSION_KEY)
    go('/')
    return
  }
  go('/Account/Login/LogOff?returnUrl=%2F')
}

function parseServerErrors(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const texts = [...doc.querySelectorAll('.validation-summary-errors li, .alert-danger li, .field-validation-error')]
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean)
  return [...new Set(texts)]
}
