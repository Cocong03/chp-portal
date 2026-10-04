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
