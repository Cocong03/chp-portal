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
  ['nolink@test.ph', ['Full Access']],
])

/** Dev-server answers by Server Logic name. Each module adds its own fixture when it's built. */
export const mocks: Record<string, ((request: MockRequest) => unknown) | undefined> = {
  me: (): MeDto => {
    const email = (getPortalUser()?.email ?? 'full@test.ph').trim().toLowerCase()
    return {
      contact: { name: 'J.D. Santos', email },
      // Wireframe ACCOUNTS[0]; nolink@ simulates a contact that isn't linked to an account yet.
      account:
        email === 'nolink@test.ph'
          ? null
          : { customerNo: '10482', customerName: 'J.D. Santos Hardware & Construction Supply', company: 'Solid Cement' },
      roles: ['Authenticated Users', ...(ROLES_BY_EMAIL.get(email) ?? ['Full Access'])],
    }
  },
}
