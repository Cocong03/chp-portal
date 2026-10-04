import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Radix menus and dialogs call these; jsdom doesn't implement them.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.resetAllMocks() // also drops per-test implementations; vi.fn(impl) goes back to impl
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
