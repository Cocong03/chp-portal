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
