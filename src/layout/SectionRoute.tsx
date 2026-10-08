import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { Navigate } from 'react-router-dom'
import { canSee } from '@/auth/access'
import { useMe } from '@/auth/useMe'
import type { Section, SectionKey } from '@/layout/sections'
import { Placeholder } from '@/modules/Placeholder'

// Built modules, one chunk each. Sections not listed here show the placeholder until their sub-project lands.
const PAGES: Partial<Record<SectionKey, LazyExoticComponent<ComponentType>>> = {
  sites: lazy(() => import('@/modules/sites/SitesPage').then((m) => ({ default: m.SitesPage }))),
  account: lazy(() => import('@/modules/account/AccountPage').then((m) => ({ default: m.AccountPage }))),
}

/** UX-only guard. AppShell renders routes only once `me` has loaded; Server Logic web roles are the security. */
export function SectionRoute({ section }: { section: Section }) {
  const { data } = useMe()
  if (!data || !canSee(data.roles, section.key)) return <Navigate to="/" replace />
  const Page = PAGES[section.key]
  if (!Page) return <Placeholder label={section.label} />
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  )
}
