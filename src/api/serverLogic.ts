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

/**
 * Power Pages wraps every Server Logic response. Microsoft Learn documents PascalCase
 * ({ Success, Data, Error }); the Dev runtime returns camelCase ({ success, data, error }). Accept both.
 */
interface Envelope {
  Success?: boolean
  Data?: unknown
  Error?: unknown
  success?: boolean
  data?: unknown
  error?: unknown
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
  if (!response.ok || !(envelope?.Success ?? envelope?.success)) {
    throw new ApiError(response.status, messageOf(envelope?.Error ?? envelope?.error) ?? GENERIC_ERROR)
  }
  return parseData(envelope?.Data ?? envelope?.data) as T
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
