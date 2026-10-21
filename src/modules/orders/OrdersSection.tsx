import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { NewOrderPage } from './new/NewOrderPage'
import { OrdersPage } from './OrdersPage'

// Wireframe `.tabs` / `.tab`. Blanket Orders, Drafts and Pending Approval join when they're built (S3-11, S3-12, S3-16).
const TABS = [
  { label: 'Orders', to: '/orders', end: true },
  { label: 'New Order', to: '/orders/new', end: false },
]

/** The Orders section: its tab strip, then the tab's page. */
export function OrdersSection() {
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
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<OrdersPage />} />
        <Route path="new" element={<NewOrderPage />} />
        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Routes>
    </>
  )
}
