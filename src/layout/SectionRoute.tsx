import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { Navigate } from 'react-router-dom'
import { canSee } from '@/auth/access'
import { useMe } from '@/auth/useMe'
import type { Section, SectionKey } from '@/layout/sections'
import { Placeholder } from '@/modules/Placeholder'
import { PageErrorBoundary } from './PageErrorBoundary'

// Built modules, one chunk each. Sections not listed here show the placeholder until their sub-project lands.
const PAGES: Partial<Record<SectionKey, LazyExoticComponent<ComponentType>>> = {
  dashboard: lazy(() => import('@/modules/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))),
  orders: lazy(() => import('@/modules/orders/OrdersSection').then((m) => ({ default: m.OrdersSection }))),
  ledger: lazy(() => import('@/modules/ledger/LedgerPage').then((m) => ({ default: m.LedgerPage }))),
  documents: lazy(() => import('@/modules/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage }))),
  sites: lazy(() => import('@/modules/sites/SitesPage').then((m) => ({ default: m.SitesPage }))),
  requests: lazy(() => import('@/modules/requests/RequestsPage').then((m) => ({ default: m.RequestsPage }))),
  complaints: lazy(() => import('@/modules/complaints/ComplaintsPage').then((m) => ({ default: m.ComplaintsPage }))),
  account: lazy(() => import('@/modules/account/AccountPage').then((m) => ({ default: m.AccountPage }))),
}

/**
 * UX-only guard; Server Logic web roles are the security. While `me` loads, AppShell renders the page hidden so its data
 * loads alongside; the role decides once `me` is in.
 */
export function SectionRoute({ section }: { section: Section }) {
  const { data, isPending } = useMe()
  if (!isPending && (!data || !canSee(data.roles, section.key))) return <Navigate to="/" replace />
  const Page = PAGES[section.key]
  if (!Page) return <Placeholder label={section.label} />
  // Keyed by section so moving to another section clears a failed page.
  return (
    <PageErrorBoundary key={section.key}>
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    </PageErrorBoundary>
  )
}
