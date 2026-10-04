import { useEffect } from 'react'

/** Sets document.title to "<Page> — Concreat Connect". */
export function usePageTitle(page: string): void {
  useEffect(() => {
    document.title = `${page} — Concreat Connect`
  }, [page])
}
