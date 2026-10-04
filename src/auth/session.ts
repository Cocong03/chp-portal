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

const SIGN_IN_FAILED = 'Invalid user ID or password. Please try again.'
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
  throw new Error(parseServerErrors(await response.text()).join(' ') || SIGN_IN_FAILED)
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

/**
 * Triggers the "Request activation" cloud flow. The flow answers 200 whether or not the email
 * matches a customer, so this can't be used to discover which emails exist.
 */
export async function requestActivation(email: string): Promise<void> {
  if (import.meta.env.DEV) {
    await new Promise((resolve) => setTimeout(resolve, 600))
    return
  }
  // Set in sub-project C (S1-03) once the flow exists in the ConcreatHub solution.
  const flowId: string | undefined = import.meta.env.VITE_ACTIVATION_FLOW_ID
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
    body: JSON.stringify({ eventData: JSON.stringify({ Email: email }) }),
  })
  if (!response.ok) throw new Error(ACTIVATION_SEND_FAILED)
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
