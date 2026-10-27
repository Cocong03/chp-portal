import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { BlanketOrdersPage } from './BlanketOrdersPage'
import { DraftsPage } from './drafts/DraftsPage'
import { useDrafts } from './drafts/useDrafts'
import { NewOrderPage } from './new/NewOrderPage'
import { OrdersPage } from './OrdersPage'

// Wireframe `.tabs` / `.tab`. Pending Approval joins when it's built (S3-11).
const TABS = [
  { label: 'Orders', to: '/orders', end: true },
  { label: 'Blanket Orders', to: '/orders/blanket', end: false },
  { label: 'New Order', to: '/orders/new', end: false },
  { label: 'Drafts', to: '/orders/drafts', end: false },
]

/** The Orders section: its tab strip, then the tab's page. */
export function OrdersSection() {
  const drafts = useDrafts().data?.length ?? 0
  return (
    <>
      <nav aria-label="Orders sections" className="mb-6 flex gap-[22px] overflow-x-auto border-b">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'border-b-2 border-transparent px-1 py-2.5 text-[14.5px] font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground',
                isActive && 'border-primary text-primary hover:text-primary',
              )
            }
          >
            {tab.label}
            {tab.to === '/orders/drafts' && drafts > 0 && (
              // Wireframe `.tab-badge`; the space keeps the link's name "Drafts 2", not "Drafts2"
              <>
                {' '}
                <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-[5px] text-[11px] text-primary-foreground">
                  {drafts}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<OrdersPage />} />
        <Route path="blanket" element={<BlanketOrdersPage />} />
        <Route path="new" element={<NewOrderPage />} />
        <Route path="drafts" element={<DraftsPage />} />
        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Routes>
    </>
  )
}
