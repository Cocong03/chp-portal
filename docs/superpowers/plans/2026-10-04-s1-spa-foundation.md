# S1 SPA Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every portal module a working shell. That means sign-in, activation and set-password screens; a session-aware AppShell with role-filtered nav and help; and one Server Logic caller that serves mock data on the dev server.

**Architecture:**
- `window.Microsoft.Dynamic365.Portal.User` decides signed-in vs anonymous, with no network call. On the dev server a sessionStorage mock session stands in for it.
- The signed-in shell loads the account and roles from the `me` Server Logic through `serverLogic()` and TanStack Query. On the dev server, `serverLogic()` answers from `src/mocks`.
- One `SECTIONS` list drives nav, routes, help and page titles. One role map (`auth/access.ts`) drives what each role sees. Both are UX only; Server Logic web roles (sub-project B) are the security.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, React Hook Form 7 + Zod 4 (`@hookform/resolvers`), shadcn/ui (radix-ui), Tailwind v4, Lucide, Vitest 5 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-s1-spa-foundation-design.md`

## Global Constraints

- **Name and titles:** customers see **Concreat Connect**. Every page sets `document.title` to `"<Page> — Concreat Connect"`.
- **Copy:** use the wireframe's wording exactly (`docs/Mockup-chp-v2.html`); Activate/SetPassword copy comes from the spec tables. No BC jargon in UI text.
- **Network:** the SPA never calls BC. It calls only `/_api/serverlogics/<name>`, `/_layout/tokenhtml`, `/SignIn`, `/Account/Login/*` and `/_api/cloudflow/v1.0/trigger/<id>`.
- **Server Logic requests:** every request, GET included, sends `__RequestVerificationToken` and `X-Requested-With: XMLHttpRequest` (Microsoft Learn, "Author server logic"). The response envelope is `{ RequestId, Success, Data, ExecutionTime, ServerLogicName, Error }`.
- **Power Pages sign-in:** POST `/SignIn` with fields `Email`, **`PasswordValue`**, `ReturnUrl`, `__RequestVerificationToken`.
- **Mock switch:** `import.meta.env.DEV`. It is true on `npm run dev` and in Vitest, and false in `vite build`. Tests flip it with `vi.stubEnv('DEV', false)`.
- **Components and styling:**
  - Prefer shadcn components and Lucide icons.
  - No inline hex in components; brand colors are `--brand-*` tokens in `src/styles/theme.css`.
  - Follow DESIGN.md §3, §4, §5 and §7.
- **Dependencies:** add no npm dependencies. The shadcn CLI only adds component files under `src/ui/`. If it changes `package.json`, revert that.
- **Tests:**
  - Vitest + RTL, colocated, `userEvent`, accessible queries.
  - Mock only the boundaries: `fetch`, `@/lib/go` (navigation), and `@/auth/session` in page tests.
- **Commits:** reference the plan task IDs (S1-08…S1-11) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Agreed deviations from the spec:**
  - `React.lazy` waits for the first real module, because all 8 sections share one `Placeholder` for now.
  - No `Badge` component yet (nothing uses it).
  - The mock switch is `import.meta.env.DEV` instead of a hostname check. It's equivalent and testable.

## Review Focus

These are the five failure modes the spec implies but its own tests don't pin. Each has a test in the task named after it.

1. A Full Access user opens a deep link such as `/ledger` while `me` is still loading. They should land on Customer Ledger, not be bounced to the Dashboard. (Task 6)
2. Server Logic answers with an HTML gateway page (502, not JSON). The caller should throw `ApiError` with generic copy, not crash on `JSON.parse`. (Task 3)
3. A double-click or double Enter on **Sign in** should send exactly one sign-in POST. (Task 4)
4. An activation link whose code the server rejects (already used or expired) should show the "This link has expired" card, not a generic error. (Task 5)
5. A mock email typed with different case or spaces (` Finance@Test.PH `) should still get the Finance & Documents fixture. (Tasks 2 and 3)

---

## File Map

| File | Responsibility |
|---|---|
| `src/layout/sections.ts` | The 8 sections: key, path, label, help (wireframe order and copy) |
| `src/auth/access.ts` | Role → sections map, `canSee`, `hasBusinessRole` (UX only) |
| `src/lib/go.ts` | Full-page navigation (mockable) |
| `src/auth/session.ts` | Power Pages session: `getPortalUser`, `signIn`, `redeemInvitation`, `requestActivation`, `signOut`, CSRF token |
| `src/api/types.ts` | `MeDto` |
| `src/mocks/index.ts` | Dev-server responses by Server Logic name (`me` per mock email) |
| `src/api/serverLogic.ts` | The only Server Logic caller; `ApiError` |
| `src/auth/useMe.ts` | TanStack Query hook for `me` |
| `src/lib/usePageTitle.ts` | Sets `document.title` |
| `src/test/render.tsx` | `renderApp()` test helper (QueryClient + MemoryRouter) |
| `src/ui/Logo.tsx` | Concreat ring mark (SVG) |
| `src/modules/signin/AuthLayout.tsx` | Brand panel + card shell and shared sign-in pieces |
| `src/modules/signin/SignIn.tsx`, `Activate.tsx`, `SetPassword.tsx` | The three anonymous screens |
| `src/ui/PageHeader.tsx` | `h1` + caption + actions |
| `src/modules/Placeholder.tsx` | "Coming soon" section page |
| `src/layout/NoAccess.tsx` | No-business-role page |
| `src/layout/HelpDialog.tsx` | In-portal help (S1-10) |
| `src/layout/UserMenu.tsx` | Avatar dropdown with Sign out |
| `src/layout/SectionRoute.tsx` | Per-section UX guard |
| `src/layout/AppShell.tsx` | Topbar + nav + `<Outlet/>` with loading/error/no-role states |
| `src/App.tsx` | Anonymous vs signed-in route trees |
| `docs/wording-checklist.md` | Renames applied (input to S5-04) |

---

### Task 1: Sections and role access map

**Files:**
- Create: `src/layout/sections.ts`
- Create: `src/auth/access.ts`
- Test: `src/auth/access.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SectionKey = 'dashboard' | 'sites' | 'orders' | 'ledger' | 'documents' | 'requests' | 'complaints' | 'account'`
  - `interface Section { key: SectionKey; path: string; label: string; help: string }`
  - `const SECTIONS: Section[]`
  - `canSee(roles: string[], section: SectionKey): boolean`
  - `hasBusinessRole(roles: string[]): boolean`

- [ ] **Step 1: Write the failing test** — `src/auth/access.test.ts`

```ts
import { SECTIONS, type SectionKey } from '@/layout/sections'
import { canSee, hasBusinessRole } from './access'

const visible = (roles: string[]) => SECTIONS.filter((s) => canSee(roles, s.key)).map((s) => s.key)

test.each<[string, SectionKey[]]>([
  ['Full Access', ['dashboard', 'sites', 'orders', 'ledger', 'documents', 'requests', 'complaints', 'account']],
  ['Orders & Delivery', ['dashboard', 'sites', 'orders', 'requests', 'account']],
  ['Finance & Documents', ['dashboard', 'ledger', 'documents', 'account']],
  ['View Only', ['dashboard', 'account']],
])('%s sees exactly its sections, in nav order', (role, expected) => {
  expect(visible(['Authenticated Users', role])).toEqual(expected)
})

test('several roles see the union of their sections', () => {
  expect(visible(['View Only', 'Finance & Documents'])).toEqual(['dashboard', 'ledger', 'documents', 'account'])
})

test('non-business roles see nothing and do not count as a business role', () => {
  const roles = ['Authenticated Users', 'Administrators', 'constructor']
  expect(visible(roles)).toEqual([])
  expect(hasBusinessRole(roles)).toBe(false)
})

test('any one business role counts', () => {
  expect(hasBusinessRole(['Authenticated Users', 'View Only'])).toBe(true)
})

test('nav follows the wireframe order and labels', () => {
  expect(SECTIONS.map((s) => [s.label, s.path])).toEqual([
    ['Dashboard', '/'],
    ['Delivery Sites', '/sites'],
    ['Orders', '/orders'],
    ['Customer Ledger', '/ledger'],
    ['Document Center', '/documents'],
    ['Requests', '/requests'],
    ['Complaints & Feedback', '/complaints'],
    ['Account and User Management', '/account'],
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/auth/access.test.ts`
Expected: FAIL. It can't resolve `@/layout/sections` / `./access`.

- [ ] **Step 3: Write `src/layout/sections.ts`**

```ts
export type SectionKey = 'dashboard' | 'sites' | 'orders' | 'ledger' | 'documents' | 'requests' | 'complaints' | 'account'

export interface Section {
  key: SectionKey
  path: string
  label: string
  /** One-paragraph overview for the Help dialog (wireframe help modal, verbatim). */
  help: string
}

// Wireframe nav order and labels (`.app-sections`). Nav, routes, help and page titles all read this list.
export const SECTIONS: Section[] = [
  {
    key: 'dashboard',
    path: '/',
    label: 'Dashboard',
    help: 'A quick greeting, your account balance and credit standing, and a live snapshot of your Sales Orders by status — click any tile to jump straight to those orders.',
  },
  {
    key: 'sites',
    path: '/sites',
    label: 'Delivery Sites',
    help: "The sites approved for delivery on your account. Request a new site, or a change to one already here, and track that request until it's approved.",
  },
  {
    key: 'orders',
    path: '/orders',
    label: 'Orders',
    help: 'Place a Single or Blanket Order, submit multiple orders at once, and track every order from submission through delivery and invoicing.',
  },
  {
    key: 'ledger',
    path: '/ledger',
    label: 'Customer Ledger',
    help: "Your account's posted invoices, credit memos, and payments — the same figures reflected on the Dashboard.",
  },
  {
    key: 'documents',
    path: '/documents',
    label: 'Document Center',
    help: 'Download invoices, credit memos, receipts, and a generated Statement of Account, any time.',
  },
  {
    key: 'requests',
    path: '/requests',
    label: 'Requests',
    help: 'Ask your account team about a sales order, a trip, a delivery, or a document copy, and track it through to resolution.',
  },
  {
    key: 'complaints',
    path: '/complaints',
    label: 'Complaints & Feedback',
    help: "File a complaint about an order, delivery, or service, and track its status until it's resolved.",
  },
  {
    key: 'account',
    path: '/account',
    label: 'Account and User Management',
    help: 'Your registered company details, and who on your team can sign in to the portal and what they can see.',
  },
]
```

- [ ] **Step 4: Write `src/auth/access.ts`**

```ts
import type { SectionKey } from '@/layout/sections'

// Wireframe PORTAL_ROLE_PAGES, plus Account for every role (Q6 recommendation, pending Rene).
// A Map, so role names like "constructor" never hit Object.prototype.
const ROLE_SECTIONS = new Map<string, SectionKey[]>([
  ['Full Access', ['dashboard', 'orders', 'ledger', 'documents', 'sites', 'complaints', 'requests', 'account']],
  ['Orders & Delivery', ['dashboard', 'orders', 'sites', 'requests', 'account']],
  ['Finance & Documents', ['dashboard', 'ledger', 'documents', 'account']],
  ['View Only', ['dashboard', 'account']],
])

/** UX only. Server Logic web roles and table permissions are the security. */
export function canSee(roles: string[], section: SectionKey): boolean {
  return roles.some((role) => ROLE_SECTIONS.get(role)?.includes(section) ?? false)
}

export function hasBusinessRole(roles: string[]): boolean {
  return roles.some((role) => ROLE_SECTIONS.has(role))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/auth/access.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/layout/sections.ts src/auth/access.ts src/auth/access.test.ts
git commit -m "S1-08/S1-10: section list and role access map

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Power Pages session (`auth/session.ts`)

**Files:**
- Create: `src/lib/go.ts`
- Create: `src/auth/session.ts`
- Modify: `src/test/setup.ts` (reset state between tests)
- Test: `src/auth/session.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `go(url: string): void` from `@/lib/go`
  - `interface PortalUser { userName; firstName; lastName; email; contactId: string; userRoles: string[] }`
  - `MOCK_SESSION_KEY = 'concreat.mockSession'`
  - `class InvalidInvitationError extends Error`
  - `getPortalUser(): PortalUser | undefined`
  - `fetchAntiForgeryToken(): Promise<string>`
  - `signIn(email: string, password: string): Promise<void>`
  - `redeemInvitation(code: string, email: string, password: string, confirmPassword: string): Promise<void>`
  - `requestActivation(email: string): Promise<void>`
  - `signOut(): void`
- Dev-server behavior:
  - `signIn` and `redeemInvitation` store `email.trim().toLowerCase()` under `MOCK_SESSION_KEY`, then `go('/')`.
  - `redeemInvitation` with code `expired` throws `InvalidInvitationError`, for manual testing.

- [ ] **Step 1: Make tests independent** — replace `src/test/setup.ts` with:

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.resetAllMocks() // also drops per-test implementations; vi.fn(impl) goes back to impl
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
```

- [ ] **Step 2: Write the failing test** — `src/auth/session.test.ts`

```ts
import { go } from '@/lib/go'
import {
  getPortalUser,
  InvalidInvitationError,
  MOCK_SESSION_KEY,
  redeemInvitation,
  requestActivation,
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

  test('signIn surfaces the Power Pages validation message', async () => {
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
    await expect(signIn('jd@x.ph', 'wrong')).rejects.toThrow('Invalid sign-in attempt.')
    expect(go).not.toHaveBeenCalled()
  })

  test('redeemInvitation rejects an invitation the server no longer offers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body><p>Not found</p></body></html>')))
    await expect(redeemInvitation('used-code', 'jd@x.ph', 'Abcdefg1', 'Abcdefg1')).rejects.toBeInstanceOf(InvalidInvitationError)
  })

  test('requestActivation fails cleanly until the flow id is configured', async () => {
    vi.stubEnv('VITE_ACTIVATION_FLOW_ID', '')
    await expect(requestActivation('jd@x.ph')).rejects.toThrow("We couldn't send the activation email right now.")
  })

  test('requestActivation posts the email to the flow trigger with CSRF headers', async () => {
    vi.stubEnv('VITE_ACTIVATION_FLOW_ID', 'flow-1')
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/_layout/tokenhtml' ? new Response(TOKEN_PAGE) : new Response('{}'),
    )
    vi.stubGlobal('fetch', fetchMock)

    await requestActivation('jd@x.ph')

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/_api/cloudflow/v1.0/trigger/flow-1')
    expect(JSON.parse(init!.body as string)).toEqual({ eventData: JSON.stringify({ Email: 'jd@x.ph' }) })
    const headers = new Headers(init!.headers)
    expect(headers.get('__RequestVerificationToken')).toBe('tok123')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/auth/session.test.ts`
Expected: FAIL. It can't resolve `@/lib/go` / `./session`.

- [ ] **Step 4: Write `src/lib/go.ts`**

```ts
/** Full-page navigation, in its own module so tests can mock it (jsdom can't navigate). */
export function go(url: string): void {
  window.location.assign(url)
}
```

- [ ] **Step 5: Write `src/auth/session.ts`**

```ts
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
  const response = await fetch('/_layout/tokenhtml', { credentials: 'same-origin' })
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
  const response = await fetch('/SignIn', {
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
  const pageResponse = await fetch(`/Account/Login/Register?${new URLSearchParams({ returnUrl: '/', invitationCode: code })}`, {
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

  const response = await fetch(action.pathname + action.search, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'same-origin',
    body,
  })
  if (response.redirected) {
    go(response.url)
    return
  }
  throw new Error(parseServerErrors(await response.text()).join(' ') || ACTIVATION_FAILED)
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
  const response = await fetch(`/_api/cloudflow/v1.0/trigger/${flowId}`, {
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/auth/session.test.ts`
Expected: PASS (9 tests).
If the deployed-site tests still take the dev branch, `vi.stubEnv('DEV', false)` isn't reaching `import.meta.env`. Confirm the Vitest version supports stubbing `DEV` (Vitest docs, `vi.stubEnv`) before changing the code.

- [ ] **Step 7: Commit**

```bash
git add src/lib/go.ts src/auth/session.ts src/auth/session.test.ts src/test/setup.ts
git commit -m "S1-08: Power Pages session (sign-in, invitation redemption, activation request, mock session)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server Logic caller, `me` mock and `useMe`

**Files:**
- Create: `src/api/types.ts`
- Create: `src/mocks/index.ts`
- Create: `src/api/serverLogic.ts`
- Create: `src/auth/useMe.ts`
- Test: `src/api/serverLogic.test.ts`

**Interfaces:**
- Consumes: `getPortalUser`, `fetchAntiForgeryToken`, `MOCK_SESSION_KEY` (Task 2).
- Produces:
  - `interface MeDto { contact: { name: string; email: string }; account: { customerNo: string; customerName: string; company: string }; roles: string[] }`
  - `interface MockRequest { method: string; query?: Record<string, string>; body?: unknown }`
  - `mocks: Record<string, ((request: MockRequest) => unknown) | undefined>`
  - `GENERIC_ERROR = 'Something went wrong. Please try again.'`
  - `class ApiError extends Error { readonly status: number }`
  - `interface ServerLogicOptions { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; query?: Record<string, string>; body?: unknown }`
  - `serverLogic<T>(name: string, options?: ServerLogicOptions): Promise<T>`
  - `useMe()` → TanStack `UseQueryResult<MeDto>`, query key `['me']`
- Mock emails:

  | Email | Roles |
  |---|---|
  | `full@test.ph` (and any unknown email) | Full Access |
  | `orders@test.ph` | Orders & Delivery |
  | `finance@test.ph` | Finance & Documents |
  | `viewonly@test.ph` | View Only |
  | `norole@test.ph` | none |

  Every mock user also has `Authenticated Users`. All share contact `J.D. Santos` and account `10482 · J.D. Santos Hardware & Construction Supply · Solid Cement`.

- [ ] **Step 1: Write the failing test** — `src/api/serverLogic.test.ts`

```ts
import { MOCK_SESSION_KEY } from '@/auth/session'
import { ApiError, GENERIC_ERROR, serverLogic } from './serverLogic'
import type { MeDto } from './types'

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

  test('an endpoint without a mock is a 404 ApiError', async () => {
    const error = await caught(serverLogic('nope'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
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

  test('a non-JSON gateway page throws a generic ApiError instead of crashing', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }))
    const error = await caught(serverLogic('orders'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.message).toBe(GENERIC_ERROR)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/serverLogic.test.ts`
Expected: FAIL. It can't resolve `./serverLogic`.

- [ ] **Step 3: Write `src/api/types.ts`**

```ts
/** GET /_api/serverlogics/me. Field names follow the wireframe (ACCOUNTS[], CURRENT_USER). */
export interface MeDto {
  contact: { name: string; email: string }
  /** company: "Solid Cement" | "APO Cement" */
  account: { customerNo: string; customerName: string; company: string }
  /** Web role names, e.g. "Authenticated Users", "Full Access". */
  roles: string[]
}
```

- [ ] **Step 4: Write `src/mocks/index.ts`**

```ts
import type { MeDto } from '@/api/types'
import { getPortalUser } from '@/auth/session'

export interface MockRequest {
  method: string
  query?: Record<string, string>
  body?: unknown
}

// Sign in on the dev server with one of these emails to see that role's portal. Unknown emails get Full Access.
const ROLES_BY_EMAIL = new Map<string, string[]>([
  ['full@test.ph', ['Full Access']],
  ['orders@test.ph', ['Orders & Delivery']],
  ['finance@test.ph', ['Finance & Documents']],
  ['viewonly@test.ph', ['View Only']],
  ['norole@test.ph', []],
])

/** Dev-server answers by Server Logic name. Each module adds its own fixture when it's built. */
export const mocks: Record<string, ((request: MockRequest) => unknown) | undefined> = {
  me: (): MeDto => {
    const email = (getPortalUser()?.email ?? 'full@test.ph').trim().toLowerCase()
    return {
      contact: { name: 'J.D. Santos', email },
      // Wireframe ACCOUNTS[0]
      account: { customerNo: '10482', customerName: 'J.D. Santos Hardware & Construction Supply', company: 'Solid Cement' },
      roles: ['Authenticated Users', ...(ROLES_BY_EMAIL.get(email) ?? ['Full Access'])],
    }
  },
}
```

- [ ] **Step 5: Write `src/api/serverLogic.ts`**

```ts
import { fetchAntiForgeryToken } from '@/auth/session'
import { mocks } from '@/mocks'

export interface ServerLogicOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string>
  body?: unknown
}

export const GENERIC_ERROR = 'Something went wrong. Please try again.'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Power Pages wraps every Server Logic response: { RequestId, Success, Data, ExecutionTime, ServerLogicName, Error }. */
interface Envelope {
  Success?: boolean
  Data?: unknown
  Error?: unknown
}

/** The SPA's only Server Logic caller. On the dev server it answers from src/mocks. */
export async function serverLogic<T>(name: string, { method = 'GET', query, body }: ServerLogicOptions = {}): Promise<T> {
  if (import.meta.env.DEV) {
    const mock = mocks[name]
    if (!mock) throw new ApiError(404, `No mock for Server Logic "${name}"`)
    await new Promise((resolve) => setTimeout(resolve, 150))
    return mock({ method, query, body }) as T
  }

  const search = query ? `?${new URLSearchParams(query)}` : ''
  const response = await fetch(`/_api/serverlogics/${name}${search}`, {
    method,
    credentials: 'same-origin',
    // Microsoft Learn: every Server Logic request carries the CSRF token, GET included.
    headers: {
      'Content-Type': 'application/json',
      __RequestVerificationToken: await fetchAntiForgeryToken(),
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const envelope = (await response.json().catch(() => undefined)) as Envelope | undefined
  if (!response.ok || !envelope?.Success) {
    throw new ApiError(response.status, messageOf(envelope?.Error) ?? GENERIC_ERROR)
  }
  return parseData(envelope.Data) as T
}

function messageOf(error: unknown): string | undefined {
  if (typeof error === 'string' && error) return error
  if (error && typeof error === 'object' && 'Message' in error && typeof error.Message === 'string') return error.Message
  return undefined
}

// Server Logic functions return strings; ours return JSON.stringify(...).
function parseData(data: unknown): unknown {
  if (typeof data !== 'string') return data
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}
```

- [ ] **Step 6: Write `src/auth/useMe.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { serverLogic } from '@/api/serverLogic'
import type { MeDto } from '@/api/types'

/** The signed-in contact, active account and web roles, from the `me` Server Logic. */
export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => serverLogic<MeDto>('me'), staleTime: 5 * 60_000 })
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/api src/auth`
Expected: PASS. `serverLogic.test.ts` has 8 tests; `session.test.ts` and `access.test.ts` still pass.

- [ ] **Step 8: Commit**

```bash
git add src/api src/mocks src/auth/useMe.ts
git commit -m "S1-08: serverLogic caller with dev-server mocks, me fixtures per role, useMe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Brand layout and the Sign in screen

**Files:**
- Generate: `src/ui/field.tsx`, `src/ui/input.tsx`, `src/ui/label.tsx` (and `src/ui/separator.tsx` if `field` pulls it in) via the shadcn CLI
- Modify: `src/styles/theme.css` (brand tokens; a light scope)
- Create: `src/lib/usePageTitle.ts`
- Create: `src/test/render.tsx`
- Create: `src/ui/Logo.tsx`
- Create: `src/modules/signin/AuthLayout.tsx`
- Create: `src/modules/signin/SignIn.tsx`
- Test: `src/modules/signin/SignIn.test.tsx`

**Interfaces:**
- Consumes: `signIn` (Task 2).
- Produces:
  - `usePageTitle(page: string): void`
  - `renderApp(ui: ReactElement, options?: { route?: string })`
  - `Logo({ size?: number })`
  - From `AuthLayout.tsx`:
    - `AuthLayout({ children })`
    - `AuthCardHeader({ title, sub? })`
    - `FormAlert({ children })`, which renders `role="alert"`
    - `ActivationNote()`, `SupportLine()`
    - class strings `labelClass`, `inputClass`, `brandButton`
  - `SignIn()`

- [ ] **Step 1: Add the shadcn form components**

Run: `npx shadcn add field input label --yes`
Then run `git status --short` and `git diff package.json src/ui/button.tsx`.
- Expected: new files under `src/ui/` (`field.tsx`, `input.tsx`, `label.tsx`, possibly `separator.tsx`); **no** change to `package.json` or `src/ui/button.tsx`.
- If either changed, restore it: `git checkout -- package.json package-lock.json src/ui/button.tsx`.
- Open `src/ui/field.tsx` and confirm it exports `Field`, `FieldGroup`, `FieldLabel`, `FieldDescription`, `FieldError`, and that `FieldError` takes an `errors` array of `{ message?: string } | undefined`. Steps below rely on those names.

- [ ] **Step 2: Add brand tokens and a light scope to `src/styles/theme.css`**

Replace the opening line of the light token block:

```css
:root {
  --shadow: 0 1px 2px rgb(23 34 46 / 0.06), 0 4px 14px rgb(23 34 46 / 0.05);
```

with:

```css
/* [data-theme='light'] re-applies the light tokens inside a dark page (sign-in screens are fixed light). */
:root,
[data-theme='light'] {
  /* Fixed brand palette for the sign-in screens (DESIGN.md §7); deliberately not redefined for dark. */
  --brand-navy: #1b2e63;
  --brand-navy-deep: #0c1633;
  --brand-ink: #16255a;
  --brand-blue: #3e63b8;
  --brand-ring-navy: #142b63;
  --brand-steel: #a7adb6;
  --brand-sky: #9ad3ec;
  --brand-soft: #eaf1fc;
  --brand-field: #d7dce2;
  --brand-divider: #eaedf1;
  --shadow: 0 1px 2px rgb(23 34 46 / 0.06), 0 4px 14px rgb(23 34 46 / 0.05);
```

and inside `@theme inline { … }`, after `--color-ring: var(--ring);`, add:

```css
  --color-brand-navy: var(--brand-navy);
  --color-brand-navy-deep: var(--brand-navy-deep);
  --color-brand-ink: var(--brand-ink);
  --color-brand-blue: var(--brand-blue);
  --color-brand-soft: var(--brand-soft);
  --color-brand-field: var(--brand-field);
  --color-brand-divider: var(--brand-divider);
```

- [ ] **Step 3: Write `src/lib/usePageTitle.ts` and `src/test/render.tsx`**

```ts
import { useEffect } from 'react'

/** Sets document.title to "<Page> — Concreat Connect". */
export function usePageTitle(page: string): void {
  useEffect(() => {
    document.title = `${page} — Concreat Connect`
  }, [page])
}
```

```tsx
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

/** Renders with the app's providers. Each call gets a fresh QueryClient so tests share no cache. */
export function renderApp(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
```

- [ ] **Step 4: Write the failing test** — `src/modules/signin/SignIn.test.tsx`

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { signIn } from '@/auth/session'
import { renderApp } from '@/test/render'
import { SignIn } from './SignIn'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  signIn: vi.fn(),
}))

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('User ID or email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

test('shows the wireframe copy and sets the title', () => {
  renderApp(<SignIn />)
  expect(screen.getByRole('heading', { name: 'Sign in to Concreat Connect' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Concreat Connect' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/Account/Login/ForgotPassword')
  expect(screen.getByRole('link', { name: 'Activate your account' })).toHaveAttribute('href', '/activate')
  expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '#')
  expect(screen.getByRole('link', { name: 'Data Privacy Policy' })).toHaveAttribute('href', '#')
  expect(document.title).toBe('Sign in — Concreat Connect')
})

test('asks for both fields before calling the server', async () => {
  const user = userEvent.setup()
  renderApp(<SignIn />)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Enter your user ID or email.')).toBeInTheDocument()
  expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  expect(signIn).not.toHaveBeenCalled()
})

test('signs in with the trimmed user ID and the password', async () => {
  vi.mocked(signIn).mockResolvedValue()
  renderApp(<SignIn />)
  await fillAndSubmit('  jd@x.ph ', 'S3cret!')
  // Zod validation is async, so the call lands after the click resolves.
  await waitFor(() => expect(signIn).toHaveBeenCalledWith('jd@x.ph', 'S3cret!'))
})

test('shows the Power Pages error and lets the user try again', async () => {
  vi.mocked(signIn).mockRejectedValue(new Error('Invalid sign-in attempt.'))
  renderApp(<SignIn />)
  await fillAndSubmit('jd@x.ph', 'wrong')
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid sign-in attempt.')
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
})

test('a double click sends one sign-in request', async () => {
  vi.mocked(signIn).mockReturnValue(new Promise(() => {}))
  const user = userEvent.setup()
  renderApp(<SignIn />)
  await user.type(screen.getByLabelText('User ID or email'), 'jd@x.ph')
  await user.type(screen.getByLabelText('Password'), 'S3cret!')
  await user.dblClick(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
  await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1))
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/modules/signin/SignIn.test.tsx`
Expected: FAIL. It can't resolve `./SignIn`.

- [ ] **Step 6: Write `src/ui/Logo.tsx`**

```tsx
// Concreat ring mark (wireframe .topbar-logo-mark): four quarter arcs, rotated to match `conic-gradient(from -45deg …)`.
const SEGMENTS = ['var(--brand-blue)', 'var(--brand-ring-navy)', 'var(--brand-steel)', 'var(--brand-sky)']
const RADIUS = 11
const QUARTER = (2 * Math.PI * RADIUS) / 4

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
      <g transform="rotate(-135 15 15)" fill="none" strokeWidth={8}>
        {SEGMENTS.map((color, i) => (
          <circle
            key={color}
            cx={15}
            cy={15}
            r={RADIUS}
            stroke={color}
            strokeDasharray={`${QUARTER} ${QUARTER * 3}`}
            strokeDashoffset={-QUARTER * i}
          />
        ))}
      </g>
    </svg>
  )
}
```

- [ ] **Step 7: Write `src/modules/signin/AuthLayout.tsx`**

```tsx
import type { ReactNode } from 'react'
import { ClipboardList, FileText, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/ui/Logo'

// Wireframe #auth-signin brand screen. Fixed light palette (DESIGN.md §7), whatever the app theme.

const FEATURES = [
  { icon: LayoutGrid, title: 'See your account at a glance', desc: 'Available credit, open orders, and customer ledger.' },
  { icon: ClipboardList, title: 'Order and re-order in minutes', desc: 'Place, repeat a previous order, and schedule deliveries.' },
  { icon: FileText, title: 'Everything on record', desc: 'Invoices, delivery receipts, and other documents ready to view and download.' },
]

const BRANDS = [
  { name: 'APO', pill: 'APO CEMENT', ribbon: 'bg-primary' },
  { name: 'RIZAL', pill: 'RIZAL CEMENT', ribbon: 'bg-destructive' },
  { name: 'ISLAND', pill: 'ISLAND CEMENT', ribbon: 'bg-brand-ink' },
]

export const labelClass = 'text-[12.5px] font-semibold text-muted-foreground'
export const inputClass = 'h-auto border-brand-field bg-card px-3 py-2.5 text-[13.5px]'
export const brandButton = 'h-auto w-full rounded-[7px] bg-brand-navy py-3 text-sm font-bold text-white hover:bg-brand-navy'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" className="flex min-h-screen flex-wrap bg-card text-foreground">
      <div className="flex flex-[1_1_560px] flex-col justify-center px-[clamp(24px,6vw,76px)] py-[clamp(32px,5vw,64px)]">
        <div className="mb-[34px] flex items-center gap-3.5">
          <Logo size={50} />
          <span className="text-[21px] font-extrabold tracking-[0.01em] text-brand-ink">CONCREAT</span>
        </div>
        <p className="mb-1.5 text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">Welcome to</p>
        <h1 className="mb-1.5 text-[clamp(28px,3.4vw,38px)] leading-[1.08] font-extrabold text-balance text-brand-ink">
          Concreat Connect
        </h1>
        <p className="mb-4 text-[clamp(19px,2.2vw,25px)] font-extrabold">One hub for every order.</p>
        <p className="mb-[26px] max-w-[520px] text-sm leading-[1.55] text-muted-foreground">
          Concreat Connect gives you a secure view of every account registered to your email across APO Cement Corporation and
          Solid Cement Corporation — orders, deliveries, credit, and documents in one place.
        </p>
        <ul className="mb-[30px] flex max-w-[480px] flex-col gap-[15px]">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex items-start gap-[13px]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary" aria-hidden="true">
                <Icon size={15} strokeWidth={2} />
              </span>
              <div>
                <div className="text-[13.5px] font-bold">{title}</div>
                <div className="mt-0.5 text-[12.5px] text-muted-foreground">{desc}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-[18px]">
          {BRANDS.map((brand) => (
            <div key={brand.name} className="flex flex-col items-center gap-[9px]">
              <div
                aria-hidden="true"
                className="relative flex h-[98px] w-[74px] flex-col items-center justify-center overflow-hidden rounded-md border border-brand-field bg-linear-180 from-muted to-border text-center"
              >
                <div className={cn('absolute top-[9px] -right-[25px] h-[15px] w-20 rotate-40', brand.ribbon)} />
                <div className="text-[11.5px] font-extrabold tracking-[0.01em]">{brand.name}</div>
                <div className="mt-[3px] text-[8px] font-semibold tracking-[0.03em] text-muted-foreground uppercase">Portland Cement</div>
              </div>
              <span className="rounded-full bg-brand-soft px-[11px] py-1 text-[10.5px] font-bold tracking-[0.02em] whitespace-nowrap text-accent-foreground">
                {brand.pill}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-[1_1_420px] items-center justify-center bg-linear-160 from-brand-navy to-brand-navy-deep px-[26px] py-10">
        <div className="w-full max-w-[420px] rounded-[14px] bg-card px-[34px] py-9 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">{children}</div>
      </div>
    </div>
  )
}

export function AuthCardHeader({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <>
      <h2 className="mb-2 text-center text-[23px] font-extrabold text-brand-ink">{title}</h2>
      {sub && <p className="mb-[26px] text-center text-[13px] text-muted-foreground">{sub}</p>}
    </>
  )
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-lg bg-destructive-soft px-3 py-2 text-[12.5px] text-destructive">
      {children}
    </p>
  )
}

export function ActivationNote() {
  return (
    <p className="mt-[5px] text-center text-[11.5px] text-faint">
      For existing Concreat Holdings customers only — new accounts are set up by your account manager.
    </p>
  )
}

export function SupportLine() {
  return (
    <p className="mt-4 border-t border-brand-divider pt-4 text-center text-xs text-muted-foreground">
      Need assistance? Contact <strong>Concreat Customer Service Center</strong> at <strong>(02) 8849-3600</strong>.
    </p>
  )
}
```

- [ ] **Step 8: Write `src/modules/signin/SignIn.tsx`**

```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { signIn } from '@/auth/session'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { ActivationNote, AuthCardHeader, AuthLayout, brandButton, FormAlert, inputClass, labelClass, SupportLine } from './AuthLayout'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your user ID or email.'),
  password: z.string().min(1, 'Enter your password.'),
})
type Values = z.infer<typeof schema>

export function SignIn() {
  usePageTitle('Sign in')
  const [serverError, setServerError] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(undefined)
    try {
      await signIn(email, password)
    } catch (error) {
      setServerError(error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.')
    }
  })

  return (
    <AuthLayout>
      <AuthCardHeader title="Sign in to Concreat Connect" sub="Use the access details provided for your customer account." />
      <form noValidate onSubmit={onSubmit}>
        <FieldGroup className="gap-[18px]">
          <Field data-invalid={errors.email ? true : undefined}>
            <FieldLabel htmlFor="signin-email" className={labelClass}>
              User ID or email
            </FieldLabel>
            <Input id="signin-email" autoComplete="username" className={inputClass} aria-invalid={!!errors.email} {...register('email')} />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={errors.password ? true : undefined}>
            <div className="flex items-baseline justify-between">
              <FieldLabel htmlFor="signin-password" className={labelClass}>
                Password
              </FieldLabel>
              <a href="/Account/Login/ForgotPassword" className="text-[12.5px] font-semibold text-primary">
                Forgot password?
              </a>
            </div>
            <Input
              id="signin-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              className={inputClass}
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            <FieldError errors={[errors.password]} />
          </Field>
        </FieldGroup>
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Button type="submit" disabled={isSubmitting} className={cn(brandButton, 'mt-5')}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-[18px] text-center text-[13px]">
        <Link to="/activate" className="font-semibold text-primary">
          Activate your account
        </Link>
      </p>
      <ActivationNote />
      <p className="mt-5 text-center text-[11.5px] leading-normal text-faint">
        By continuing, you acknowledge the{' '}
        <a href="#" className="text-primary">
          Terms of Use
        </a>{' '}
        and{' '}
        <a href="#" className="text-primary">
          Data Privacy Policy
        </a>
        .
      </p>
      <SupportLine />
    </AuthLayout>
  )
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run src/modules/signin/SignIn.test.tsx`
Expected: PASS (5 tests).
- If `FieldError` renders nothing for `errors={[undefined]}` but the label differs, check the exported names from Step 1.
- If the double-click test reports 2 calls, add a guard at the top of `onSubmit`'s inner callback (`if (isSubmitting) return`) and re-run. RHF sets `isSubmitting` synchronously, so it should already pass.

- [ ] **Step 10: Commit**

```bash
git add src/ui src/styles/theme.css src/lib/usePageTitle.ts src/test/render.tsx src/modules/signin/AuthLayout.tsx src/modules/signin/SignIn.tsx src/modules/signin/SignIn.test.tsx
git commit -m "S1-08: brand sign-in layout and Sign in screen (wireframe copy, /SignIn post)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Activate and Set password screens

**Files:**
- Create: `src/modules/signin/Activate.tsx`
- Create: `src/modules/signin/SetPassword.tsx`
- Test: `src/modules/signin/Activate.test.tsx`
- Test: `src/modules/signin/SetPassword.test.tsx`

**Interfaces:**
- Consumes:
  - `requestActivation`, `redeemInvitation`, `InvalidInvitationError` (Task 2)
  - From `AuthLayout.tsx` (Task 4): `AuthLayout`, `AuthCardHeader`, `FormAlert`, `ActivationNote`, `SupportLine`, `labelClass`, `inputClass`, `brandButton`
  - `usePageTitle`, `renderApp` (Task 4)
- Produces: `Activate()`, `SetPassword()`. SetPassword reads `?code=` with `useSearchParams`.

- [ ] **Step 1: Write the failing tests**

`src/modules/signin/Activate.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { requestActivation } from '@/auth/session'
import { renderApp } from '@/test/render'
import { Activate } from './Activate'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  requestActivation: vi.fn(),
}))

async function submit(email: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email address'), email)
  await user.click(screen.getByRole('button', { name: 'Send activation link' }))
}

test('validates the email before sending', async () => {
  renderApp(<Activate />, { route: '/activate' })
  expect(document.title).toBe('Activate your account — Concreat Connect')
  await submit('not-an-email')
  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  expect(requestActivation).not.toHaveBeenCalled()
})

test('shows the same neutral confirmation for any accepted email', async () => {
  vi.mocked(requestActivation).mockResolvedValue()
  renderApp(<Activate />, { route: '/activate' })
  await submit('jd@x.ph')
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(screen.getByText('jd@x.ph')).toBeInTheDocument()
  expect(screen.getByText(/The link can be used once and expires in 7 days\./)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/')
  expect(requestActivation).toHaveBeenCalledWith('jd@x.ph')
})

test('a send failure keeps the form and explains', async () => {
  vi.mocked(requestActivation).mockRejectedValue(new Error('flow down'))
  renderApp(<Activate />, { route: '/activate' })
  await submit('jd@x.ph')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "We couldn't send the activation email right now. Please try again in a few minutes.",
  )
  expect(screen.getByLabelText('Email address')).toBeInTheDocument()
})
```

`src/modules/signin/SetPassword.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvalidInvitationError, redeemInvitation } from '@/auth/session'
import { renderApp } from '@/test/render'
import { SetPassword } from './SetPassword'

vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  redeemInvitation: vi.fn(),
}))

const ROUTE = '/activate/complete?code=abc123'

async function fill(password: string, confirm = password, email = 'jd@x.ph') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email address'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.type(screen.getByLabelText('Confirm password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Activate account' }))
}

test('without a code it shows the expired-link card', () => {
  renderApp(<SetPassword />, { route: '/activate/complete' })
  expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/activate')
  expect(document.title).toBe('Set your password — Concreat Connect')
})

test.each([
  ['Ab1!', 'Use at least 8 characters.'],
  ['abcdefgh1', 'Use at least three of: uppercase letters, lowercase letters, numbers, symbols.'],
])('rejects %s with the password policy message', async (password, message) => {
  renderApp(<SetPassword />, { route: ROUTE })
  await fill(password)
  expect(await screen.findByText(message)).toBeInTheDocument()
  expect(redeemInvitation).not.toHaveBeenCalled()
})

test('rejects mismatched passwords', async () => {
  renderApp(<SetPassword />, { route: ROUTE })
  await fill('Abcdefg1', 'Abcdefg2')
  expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument()
  expect(redeemInvitation).not.toHaveBeenCalled()
})

test('activates with the code from the link', async () => {
  vi.mocked(redeemInvitation).mockResolvedValue()
  renderApp(<SetPassword />, { route: ROUTE })
  await fill('Abcdefg1')
  await waitFor(() => expect(redeemInvitation).toHaveBeenCalledWith('abc123', 'jd@x.ph', 'Abcdefg1', 'Abcdefg1'))
})

test('an invitation the server rejects shows the expired-link card', async () => {
  vi.mocked(redeemInvitation).mockRejectedValue(new InvalidInvitationError())
  renderApp(<SetPassword />, { route: ROUTE })
  await fill('Abcdefg1')
  expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
})

test('other server errors are shown above the button', async () => {
  vi.mocked(redeemInvitation).mockRejectedValue(new Error('Email already in use.'))
  renderApp(<SetPassword />, { route: ROUTE })
  await fill('Abcdefg1')
  expect(await screen.findByRole('alert')).toHaveTextContent('Email already in use.')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/signin/Activate.test.tsx src/modules/signin/SetPassword.test.tsx`
Expected: FAIL. It can't resolve `./Activate` / `./SetPassword`.

- [ ] **Step 3: Write `src/modules/signin/Activate.tsx`**

```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { requestActivation } from '@/auth/session'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { Field, FieldError, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { ActivationNote, AuthCardHeader, AuthLayout, brandButton, FormAlert, inputClass, labelClass, SupportLine } from './AuthLayout'

// Copy from the spec (no wireframe screen; pending client review).
const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
})
type Values = z.infer<typeof schema>

export function Activate() {
  usePageTitle('Activate your account')
  const [sentTo, setSentTo] = useState<string>()
  const [failed, setFailed] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailed(false)
    try {
      await requestActivation(email)
      setSentTo(email)
    } catch {
      setFailed(true)
    }
  })

  if (sentTo) {
    return (
      <AuthLayout>
        <AuthCardHeader title="Check your email" />
        <p className="text-center text-[13px] leading-normal text-muted-foreground">
          If <strong className="text-foreground">{sentTo}</strong> is registered to a Concreat Holdings customer account, we've sent an
          activation link to it. The link can be used once and expires in 7 days.
        </p>
        <p className="mt-3.5 text-center text-[12.5px] leading-normal text-muted-foreground">
          Didn't get it? Check your spam or junk folder, or contact the <strong>Concreat Customer Service Center</strong> at{' '}
          <strong>(02) 8849-3600</strong>.
        </p>
        <p className="mt-[18px] text-center text-[13px]">
          <Link to="/" className="font-semibold text-primary">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCardHeader
        title="Activate your account"
        sub="Enter the email address registered to your customer account. We'll email you a link to set your password."
      />
      <form noValidate onSubmit={onSubmit}>
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="activate-email" className={labelClass}>
            Email address
          </FieldLabel>
          <Input
            id="activate-email"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            className={inputClass}
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        {failed && <FormAlert>We couldn't send the activation email right now. Please try again in a few minutes.</FormAlert>}
        <Button type="submit" disabled={isSubmitting} className={cn(brandButton, 'mt-5')}>
          {isSubmitting ? 'Sending…' : 'Send activation link'}
        </Button>
      </form>
      <p className="mt-[18px] text-center text-[13px] text-muted-foreground">
        Already activated?{' '}
        <Link to="/" className="font-semibold text-primary">
          Sign in
        </Link>
      </p>
      <ActivationNote />
      <SupportLine />
    </AuthLayout>
  )
}
```

- [ ] **Step 4: Write `src/modules/signin/SetPassword.tsx`**

```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { InvalidInvitationError, redeemInvitation } from '@/auth/session'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/ui/field'
import { Input } from '@/ui/input'
import { AuthCardHeader, AuthLayout, brandButton, FormAlert, inputClass, labelClass, SupportLine } from './AuthLayout'

// Mirrors Power Pages' default policy (PasswordValidator/EnforcePasswordPolicy = true, RequiredLength = 8).
// If sub-project B changes those site settings, change this schema and the hint together.
const KINDS = [/\p{Lu}/u, /\p{Ll}/u, /\p{Nd}/u, /[^\p{L}\p{N}]/u]
const hasThreeKinds = (password: string) => KINDS.filter((kind) => kind.test(password)).length >= 3

const schema = z
  .object({
    email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
    password: z
      .string()
      .min(1, 'Enter a password.')
      .min(8, 'Use at least 8 characters.')
      .refine(hasThreeKinds, 'Use at least three of: uppercase letters, lowercase letters, numbers, symbols.'),
    confirm: z.string(),
  })
  .refine((values) => values.confirm === values.password, { message: "Passwords don't match.", path: ['confirm'] })
type Values = z.infer<typeof schema>

const FALLBACK_ERROR = "We couldn't activate your account. Please try again, or contact the Concreat Customer Service Center at (02) 8849-3600."

export function SetPassword() {
  usePageTitle('Set your password')
  const [params] = useSearchParams()
  const code = params.get('code')
  const [expired, setExpired] = useState(!code)
  const [serverError, setServerError] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', confirm: '' } })

  const onSubmit = handleSubmit(async ({ email, password, confirm }) => {
    if (!code) return
    setServerError(undefined)
    try {
      await redeemInvitation(code, email, password, confirm)
    } catch (error) {
      if (error instanceof InvalidInvitationError) setExpired(true)
      else setServerError(error instanceof Error && error.message ? error.message : FALLBACK_ERROR)
    }
  })

  if (expired) {
    return (
      <AuthLayout>
        <AuthCardHeader title="This link has expired" />
        <p className="text-center text-[13px] text-muted-foreground">
          This activation link is invalid, has already been used, or has expired.
        </p>
        <Button asChild className={cn(brandButton, 'mt-6')}>
          <Link to="/activate">Request a new link</Link>
        </Button>
        <SupportLine />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCardHeader title="Set your password" sub="Create a password to finish activating your Concreat Connect account." />
      <form noValidate onSubmit={onSubmit}>
        <FieldGroup className="gap-[18px]">
          <Field data-invalid={errors.email ? true : undefined}>
            <FieldLabel htmlFor="setpw-email" className={labelClass}>
              Email address
            </FieldLabel>
            <Input id="setpw-email" type="email" autoComplete="email" className={inputClass} aria-invalid={!!errors.email} {...register('email')} />
            <FieldDescription>The email address the activation link was sent to.</FieldDescription>
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={errors.password ? true : undefined}>
            <FieldLabel htmlFor="setpw-password" className={labelClass}>
              Password
            </FieldLabel>
            <Input
              id="setpw-password"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            <FieldDescription>At least 8 characters, using three of these: uppercase letters, lowercase letters, numbers, symbols.</FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={errors.confirm ? true : undefined}>
            <FieldLabel htmlFor="setpw-confirm" className={labelClass}>
              Confirm password
            </FieldLabel>
            <Input
              id="setpw-confirm"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              aria-invalid={!!errors.confirm}
              {...register('confirm')}
            />
            <FieldError errors={[errors.confirm]} />
          </Field>
        </FieldGroup>
        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Button type="submit" disabled={isSubmitting} className={cn(brandButton, 'mt-5')}>
          {isSubmitting ? 'Activating…' : 'Activate account'}
        </Button>
      </form>
      <SupportLine />
    </AuthLayout>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/modules/signin`
Expected: PASS (Activate 3, SetPassword 7, SignIn 5).
If `getByLabelText('Password')` finds two elements, the `FieldDescription` is probably being merged into the label. Query by `{ selector: 'input' }` instead; don't rename the label.

- [ ] **Step 6: Commit**

```bash
git add src/modules/signin/Activate.tsx src/modules/signin/SetPassword.tsx src/modules/signin/Activate.test.tsx src/modules/signin/SetPassword.test.tsx
git commit -m "S1-08: Activate and Set password screens (spec copy, Power Pages password policy)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: AppShell, Help, routing (S1-09, S1-10)

**Files:**
- Generate: `src/ui/dialog.tsx`, `src/ui/dropdown-menu.tsx`, `src/ui/avatar.tsx`, `src/ui/skeleton.tsx` via the shadcn CLI
- Modify: `src/test/setup.ts` (jsdom stubs for Radix)
- Create: `src/ui/PageHeader.tsx`
- Create: `src/modules/Placeholder.tsx`
- Create: `src/layout/NoAccess.tsx`
- Create: `src/layout/HelpDialog.tsx`
- Create: `src/layout/UserMenu.tsx`
- Create: `src/layout/SectionRoute.tsx`
- Create: `src/layout/AppShell.tsx`
- Modify: `src/App.tsx` (replace)
- Modify: `src/App.test.tsx` (replace)
- Modify: `index.html` (title and description)
- Test: `src/layout/AppShell.test.tsx`

**Interfaces:**
- Consumes:
  - `SECTIONS`, `Section`, `canSee`, `hasBusinessRole` (Task 1)
  - `getPortalUser`, `signOut`, `MOCK_SESSION_KEY` (Task 2)
  - `useMe`, `serverLogic`, `ApiError` (Task 3)
  - `usePageTitle`, `renderApp`, `Logo` (Task 4)
  - `SignIn` (Task 4), `Activate`, `SetPassword` (Task 5)
- Produces:
  - `PageHeader({ title, caption?, children? })` for every module
  - `Placeholder({ label })`
  - `AppShell()` as a layout route
  - `App()` with both route trees

- [ ] **Step 1: Add the shadcn overlay components**

Run: `npx shadcn add dialog dropdown-menu avatar skeleton --yes`
Then run `git diff package.json src/ui/button.tsx`.
- Expected: no change. If there is one, restore with `git checkout -- package.json package-lock.json src/ui/button.tsx`.
- Confirm the exports:
  - `dialog.tsx`: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`
  - `dropdown-menu.tsx`: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`
  - `avatar.tsx`: `Avatar`, `AvatarFallback`
  - `skeleton.tsx`: `Skeleton`
- In `dialog.tsx`, set the content panel to `rounded-2xl` and the overlay to `bg-scrim` (DESIGN.md §3, §5).

- [ ] **Step 2: Add jsdom stubs for Radix to `src/test/setup.ts`** (after the imports, before `afterEach`)

```ts
// Radix menus and dialogs call these; jsdom doesn't implement them.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
```

- [ ] **Step 3: Write the failing tests**

`src/layout/AppShell.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'
import { ApiError, serverLogic } from '@/api/serverLogic'
import { MOCK_SESSION_KEY } from '@/auth/session'
import { go } from '@/lib/go'
import { renderApp } from '@/test/render'

vi.mock('@/lib/go', () => ({ go: vi.fn() }))
vi.mock('@/api/serverLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/serverLogic')>()
  return { ...actual, serverLogic: vi.fn(actual.serverLogic) }
})

const ALL_SECTIONS = [
  'Dashboard',
  'Delivery Sites',
  'Orders',
  'Customer Ledger',
  'Document Center',
  'Requests',
  'Complaints & Feedback',
  'Account and User Management',
]

function signInAs(email: string, route = '/') {
  sessionStorage.setItem(MOCK_SESSION_KEY, email)
  return renderApp(<App />, { route })
}

async function navLabels() {
  const nav = await screen.findByRole('navigation', { name: 'Portal sections' })
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent)
}

test('Full Access sees all eight sections in wireframe order', async () => {
  signInAs('full@test.ph')
  expect(await navLabels()).toEqual(ALL_SECTIONS)
})

test('Finance & Documents sees only its sections', async () => {
  signInAs('finance@test.ph')
  expect(await navLabels()).toEqual(['Dashboard', 'Customer Ledger', 'Document Center', 'Account and User Management'])
})

test('the topbar shows the company, account and signed-in user', async () => {
  signInAs('full@test.ph')
  expect(await screen.findByText('Solid Cement')).toBeInTheDocument()
  expect(screen.getByText(/J\.D\. Santos Hardware & Construction Supply/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /J\.D\. Santos/ })).toHaveTextContent('JS')
})

test('a deep link inside the role lands on that section and marks it current', async () => {
  signInAs('full@test.ph', '/ledger')
  expect(await screen.findByRole('heading', { level: 1, name: 'Customer Ledger' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Customer Ledger' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  expect(document.title).toBe('Customer Ledger — Concreat Connect')
})

test('a section outside the role redirects to the Dashboard', async () => {
  signInAs('finance@test.ph', '/orders')
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  expect(document.title).toBe('Dashboard — Concreat Connect')
})

test('a contact with no business role sees the access-pending page and no nav', async () => {
  signInAs('norole@test.ph', '/orders')
  expect(await screen.findByRole('heading', { level: 1, name: 'Your portal access is being set up' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Portal sections' })).not.toBeInTheDocument()
})

test('shows a loading state while the account loads', () => {
  signInAs('full@test.ph')
  expect(screen.getByRole('status')).toHaveTextContent('Loading your account…')
})

test('a failed account load offers Retry', async () => {
  vi.mocked(serverLogic).mockRejectedValueOnce(new ApiError(500, 'boom'))
  const user = userEvent.setup()
  signInAs('full@test.ph')
  expect(await screen.findByText("We couldn't load your account details. Please try again.")).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('navigation', { name: 'Portal sections' })).toBeInTheDocument()
})

test('Help lists all eight section overviews whatever the role', async () => {
  const user = userEvent.setup()
  signInAs('viewonly@test.ph')
  await user.click(await screen.findByRole('button', { name: '? Help' }))
  const dialog = await screen.findByRole('dialog', { name: 'Getting around Concreat Connect' })
  expect(within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(ALL_SECTIONS)
})

test('Sign out ends the session', async () => {
  const user = userEvent.setup()
  signInAs('full@test.ph')
  await user.click(await screen.findByRole('button', { name: /J\.D\. Santos/ }))
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
  expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBeNull()
  expect(go).toHaveBeenCalledWith('/')
})
```

Replace `src/App.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { MOCK_SESSION_KEY } from '@/auth/session'
import { renderApp } from '@/test/render'
import App from './App'

test('an anonymous visitor to any page gets the sign-in screen', () => {
  renderApp(<App />, { route: '/orders' })
  expect(screen.getByRole('heading', { name: 'Sign in to Concreat Connect' })).toBeInTheDocument()
  expect(document.title).toBe('Sign in — Concreat Connect')
})

test('activation screens are reachable while signed out', () => {
  renderApp(<App />, { route: '/activate' })
  expect(screen.getByRole('heading', { name: 'Activate your account' })).toBeInTheDocument()
})

test('a signed-in user who opens an activation link lands on the Dashboard', async () => {
  sessionStorage.setItem(MOCK_SESSION_KEY, 'full@test.ph')
  renderApp(<App />, { route: '/activate/complete?code=abc' })
  expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/layout src/App.test.tsx`
Expected: FAIL. The current `App` renders the scaffold placeholder, and `@/layout/AppShell` doesn't exist.

- [ ] **Step 5: Write the small pieces**

`src/ui/PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react'

/** Panel head: h1 + caption on the left, actions on the right. Captions span the full width (S1-09). */
export function PageHeader({ title, caption, children }: { title: string; caption?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="mb-1 text-[19px] font-bold">{title}</h1>
        {caption && <p className="text-[13px] text-muted-foreground">{caption}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2.5">{children}</div>}
    </div>
  )
}
```

`src/modules/Placeholder.tsx`:

```tsx
import { usePageTitle } from '@/lib/usePageTitle'
import { PageHeader } from '@/ui/PageHeader'

// Stand-in for every section until its module is built (S2+). Replace per route, then add React.lazy.
export function Placeholder({ label }: { label: string }) {
  usePageTitle(label)
  return <PageHeader title={label} caption="This section is coming soon." />
}
```

`src/layout/NoAccess.tsx`:

```tsx
import { usePageTitle } from '@/lib/usePageTitle'
import { PageHeader } from '@/ui/PageHeader'

// Signed in but no business web role yet (decision D4 default: CHP ops assigns roles).
export function NoAccess() {
  usePageTitle('Access pending')
  return (
    <PageHeader
      title="Your portal access is being set up"
      caption="Contact your account manager or the Concreat Customer Service Center at (02) 8849-3600."
    />
  )
}
```

`src/layout/HelpDialog.tsx`:

```tsx
import { SECTIONS } from '@/layout/sections'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/dialog'

// S1-10 basic help: the wireframe help modal's eight overviews, for every role.
export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-40px)] overflow-y-auto p-[22px] sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Getting around Concreat Connect</DialogTitle>
          <DialogDescription>A quick guide to what each section of the portal is for.</DialogDescription>
        </DialogHeader>
        <div className="my-[18px] flex flex-col gap-3.5">
          {SECTIONS.map((section) => (
            <div key={section.key}>
              <h3 className="mb-[3px] text-[13.5px] font-bold">{section.label}</h3>
              <p className="text-[13px] leading-normal text-muted-foreground">{section.help}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

`src/layout/UserMenu.tsx`:

```tsx
import { LogOut } from 'lucide-react'
import { signOut } from '@/auth/session'
import { Avatar, AvatarFallback } from '@/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu'

// Wireframe accountInitials(): first letters of the first two words that start with a letter.
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

export function UserMenu({ name }: { name: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Avatar className="size-[26px]">
          <AvatarFallback className="bg-primary text-[11px] font-bold text-primary-foreground">{initials(name)}</AvatarFallback>
        </Avatar>
        <span>{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

`src/layout/SectionRoute.tsx`:

```tsx
import { Navigate } from 'react-router-dom'
import { canSee } from '@/auth/access'
import { useMe } from '@/auth/useMe'
import type { Section } from '@/layout/sections'
import { Placeholder } from '@/modules/Placeholder'

/** UX-only guard. AppShell renders routes only once `me` has loaded; Server Logic web roles are the security. */
export function SectionRoute({ section }: { section: Section }) {
  const { data } = useMe()
  if (!data || !canSee(data.roles, section.key)) return <Navigate to="/" replace />
  return <Placeholder label={section.label} />
}
```

- [ ] **Step 6: Write `src/layout/AppShell.tsx`**

```tsx
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { canSee, hasBusinessRole } from '@/auth/access'
import { useMe } from '@/auth/useMe'
import { SECTIONS } from '@/layout/sections'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { Logo } from '@/ui/Logo'
import { Skeleton } from '@/ui/skeleton'
import { HelpDialog } from './HelpDialog'
import { NoAccess } from './NoAccess'
import { UserMenu } from './UserMenu'

// DESIGN.md §4 section-nav pills.
const pill =
  'relative inline-flex items-center rounded-full px-3 py-[7px] text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
const activePill =
  'bg-accent font-extrabold text-accent-foreground hover:bg-accent hover:text-accent-foreground after:absolute after:inset-x-3.5 after:-bottom-2 after:h-[3px] after:rounded-full after:bg-primary after:shadow-[0_0_6px_1px_var(--primary)]'

export function AppShell() {
  const me = useMe()
  const [helpOpen, setHelpOpen] = useState(false)
  const roles = me.data?.roles ?? []
  const sections = SECTIONS.filter((section) => canSee(roles, section.key))

  let content
  if (me.isPending) {
    content = (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading your account…</span>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
    )
  } else if (me.isError) {
    content = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[13.5px] text-muted-foreground">We couldn't load your account details. Please try again.</p>
        <Button variant="outline" onClick={() => me.refetch()}>
          Retry
        </Button>
      </div>
    )
  } else if (!hasBusinessRole(roles)) {
    content = <NoAccess />
  } else {
    content = <Outlet />
  }

  return (
    <div className="mx-auto max-w-[1180px] px-[clamp(16px,4vw,40px)] pb-12">
      <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 pt-4 pb-3.5">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div>
            <div className="text-[15.5px] font-bold">Concreat Connect</div>
            <div className="text-[11.5px] text-faint">Customer Portal</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-[18px]">
          <Button variant="ghost" onClick={() => setHelpOpen(true)}>
            ? Help
          </Button>
          {me.data && (
            <>
              <p className="text-[13px] text-muted-foreground">
                Viewing <strong className="text-foreground">{me.data.account.company}</strong> · {me.data.account.customerName}
              </p>
              <UserMenu name={me.data.contact.name} />
            </>
          )}
        </div>
      </header>
      {sections.length > 0 && (
        <nav aria-label="Portal sections" className="mb-2 flex flex-wrap gap-1.5 border-b pb-3.5">
          {sections.map((section) => (
            <NavLink
              key={section.key}
              to={section.path}
              end={section.path === '/'}
              className={({ isActive }) => cn(pill, isActive && activePill)}
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
      )}
      <main className="pt-5">{content}</main>
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
```

- [ ] **Step 7: Replace `src/App.tsx`**

```tsx
import { Navigate, Route, Routes } from 'react-router-dom'
import { getPortalUser } from '@/auth/session'
import { AppShell } from '@/layout/AppShell'
import { SECTIONS } from '@/layout/sections'
import { SectionRoute } from '@/layout/SectionRoute'
import { Activate } from '@/modules/signin/Activate'
import { SetPassword } from '@/modules/signin/SetPassword'
import { SignIn } from '@/modules/signin/SignIn'

export default function App() {
  if (!getPortalUser()) {
    return (
      <Routes>
        <Route path="/" element={<SignIn />} />
        <Route path="/activate" element={<Activate />} />
        <Route path="/activate/complete" element={<SetPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<AppShell />}>
        {SECTIONS.map((section) => (
          <Route key={section.key} path={section.path} element={<SectionRoute section={section} />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 8: Update `index.html`**

Replace `<title>Concreat Hub</title>` with `<title>Concreat Connect</title>`.
Replace the description `content` with `Concreat Connect — customer portal for Concreat Holdings customers.`

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run`
Expected: all test files PASS. `AppShell.test.tsx` has 10 tests and `App.test.tsx` has 3.
- If the Sign out test can't find the `menuitem`, Radix opens on `pointerdown`. Confirm that Step 2's stubs loaded and that `userEvent.setup()` is used (not `fireEvent`).
- If the loading test finds no `status`, the dev mock resolved synchronously. Check that `serverLogic`'s dev branch still awaits its 150 ms delay.

- [ ] **Step 10: Commit**

```bash
git add src/ui src/test/setup.ts src/modules/Placeholder.tsx src/layout src/App.tsx src/App.test.tsx index.html
git commit -m "S1-09/S1-10: AppShell with role-filtered nav, help dialog, section guard and routing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wording checklist, plan status, full verification (S1-11)

**Files:**
- Create: `docs/wording-checklist.md`
- Modify: `docs/Concreat_Hub_Implementation_Plan.md` (S1-08…S1-11 status, last-updated date)

**Interfaces:**
- Consumes: everything above.
- Produces: the S5-04 input checklist and updated plan status.

- [ ] **Step 1: Write `docs/wording-checklist.md`**

```markdown
# Wording and naming checklist (S1-11 → verified at S5-04)

Customer-facing text follows the wireframe (`docs/Mockup-chp-v2.html`) and the renames in the developer packages. Add a row whenever a screen applies a rename.

| Rename / rule | Source | Applied in | Verified (S5-04) |
|---|---|---|---|
| Portal name **Concreat Connect** (not "Concreat Hub") | Wireframe; decision 2026-10-04 | Topbar, sign-in heading and card title, Help title, `document.title` (`src/lib/usePageTitle.ts`), `index.html` | ☐ |
| Nav order: Dashboard, Delivery Sites, Orders, Customer Ledger, Document Center, Requests, Complaints & Feedback, Account and User Management | PP package, Navigation item | `src/layout/sections.ts` | ☐ |
| "Account" → **Account and User Management** | PP package, Navigation item | `src/layout/sections.ts` | ☐ |
| Help overviews verbatim from the wireframe help modal | Wireframe `#help-modal` | `src/layout/sections.ts` (`help`) | ☐ |
| Activate / Set password copy (no wireframe) | Spec 2026-10-04, pending client review | `src/modules/signin/Activate.tsx`, `SetPassword.tsx` | ☐ |
| "+ New Multiple Order" | PP package | Orders (S3-13), not built yet | ☐ |
| No BC jargon (location codes, table names) and no internal service-center system name | CLAUDE.md | All screens | ☐ |
```

- [ ] **Step 2: Update the implementation plan status**

Run from the repo root:

```bash
python - <<'EOF'
p = 'docs/Concreat_Hub_Implementation_Plan.md'
s = open(p, encoding='utf-8').read()
updates = {
    'S1-08': ('✅ Done (local)', 'Sub-project A (2026-10-04): `serverLogic.ts` with dev-server mocks, `useMe()`, UX route guard, `me` fixtures per role (full@/orders@/finance@/viewonly@/norole@test.ph). Each module adds its own DTO + fixture. Deployed check after S1-07'),
    'S1-09': ('✅ Done (local)', 'AppShell: logo, nav in package order + rename, active highlight, full-width captions (`PageHeader`). Sections are placeholders until S2+'),
    'S1-10': ('✅ Done (local)', 'Help dialog with the 8 wireframe overviews, reachable from every page'),
    'S1-11': ('🟡 In progress', 'Checklist started: `docs/wording-checklist.md`. Renames continue as screens are built'),
}
lines = s.split('\n')
for i, line in enumerate(lines):
    for task, (status, note) in updates.items():
        if line.startswith(f'| {task} |'):
            prefix = line.rsplit('|', 3)[0]
            lines[i] = f'{prefix}| {status} | {note} |'
s = '\n'.join(lines).replace('Last updated **2026-10-01**', 'Last updated **2026-10-04**')
open(p, 'w', encoding='utf-8').write(s)
EOF
git diff --stat docs/Concreat_Hub_Implementation_Plan.md
```

Expected: one file changed, 5 lines (4 status rows + the date).

- [ ] **Step 3: Run the full checks**

Run: `npm test`
Expected: every test file passes, with 0 failures.

Run: `npm run lint`
Expected: exits 0 with no TypeScript errors.

Run: `npm run build`
Expected: `tsc -b` passes and `vite build` writes `dist/`. The bundle must not contain the mock emails. Check with `grep -r "finance@test.ph" dist/`, which should print nothing because the `import.meta.env.DEV` branch is stripped.
- If the emails do appear, Rollup kept the mocks module for its top-level `new Map(...)`. Prefix it with `/* @__PURE__ */` in `src/mocks/index.ts`, rebuild and re-check.

Run: `git diff --check`
Expected: no output.

- [ ] **Step 4: Manual pass on the dev server**

Run: `npm run dev` and open the printed URL (default `http://localhost:5173`). Check each item:

1. `/` shows the two-panel sign-in screen, matching the wireframe. The tab title is "Sign in — Concreat Connect".
2. Sign in with an empty form: both field errors appear.
3. Sign in as `full@test.ph` (any password):
   - all 8 pills appear, in order, with Dashboard active (glowing underline);
   - the topbar reads "Viewing **Solid Cement** · J.D. Santos Hardware & Construction Supply";
   - the avatar reads "JS".
4. Click each pill. The heading and tab title change, and only that pill is active.
5. Open "? Help": the dialog lists 8 overviews, and Esc closes it.
6. Open the user menu and choose Sign out. You're back on the sign-in screen.
7. Sign in as `finance@test.ph`: you see 4 pills, and typing `/orders` in the address bar lands on Dashboard.
8. Sign in as `norole@test.ph`: no pills, and the "Your portal access is being set up" page shows.
9. Signed out:
   - `/activate`: submit `jd@x.ph` and see "Check your email".
   - `/activate/complete`: see "This link has expired".
   - `/activate/complete?code=expired`: submit a valid form and see "This link has expired".
   - `/activate/complete?code=abc`: submit a valid form and land signed in on the Dashboard.
10. Resize to 375px wide: the topbar and nav wrap with no horizontal scroll, and the sign-in panels stack.

Note any mismatch against the wireframe as a follow-up instead of redesigning.

- [ ] **Step 5: Commit**

```bash
git add docs/wording-checklist.md docs/Concreat_Hub_Implementation_Plan.md
git commit -m "S1-11: wording checklist; plan status for S1-08..S1-11

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
