import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { canSee, hasBusinessRole } from '@/auth/access'
import { useMe } from '@/auth/useMe'
import { SECTIONS } from '@/layout/sections'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { Logo } from '@/ui/Logo'
import { Skeleton } from '@/ui/skeleton'
import { HelpDialog } from './HelpDialog'
import { MobileMenu } from './MobileMenu'
import { NoAccess } from './NoAccess'
import { UserMenu } from './UserMenu'

// DESIGN.md §4 section-nav pills.
const pill =
  'relative inline-flex shrink-0 items-center rounded-full whitespace-nowrap px-3 py-[7px] text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
const activePill =
  'bg-accent font-extrabold text-accent-foreground hover:bg-accent hover:text-accent-foreground after:absolute after:inset-x-3.5 after:-bottom-2 after:h-[3px] after:rounded-full after:bg-primary after:shadow-[0_0_6px_1px_var(--primary)]'

export function AppShell() {
  const me = useMe()
  const [helpOpen, setHelpOpen] = useState(false)
  const roles = me.data?.roles ?? []
  const sections = SECTIONS.filter((section) => canSee(roles, section.key))

  // Below lg the tab strip scrolls sideways; keep the current section visible.
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname, sections.length])

  let content
  if (me.isPending) {
    content = (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading your account…</span>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
    )
  } else if (me.isError && !me.data) {
    // A failed background refetch keeps the cached account on screen instead of unmounting the page.
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
    <div className="mx-auto max-w-[1200px] px-4 pb-12 lg:px-5">
      <header className="flex items-center justify-between gap-x-5 gap-y-2.5 pt-4 pb-3.5">
        <div className="flex items-center gap-2.5">
          <MobileMenu sections={sections} me={me.data} onHelp={() => setHelpOpen(true)} />
          <Logo />
          <div>
            <div className="text-[15.5px] font-bold">Concreat Connect</div>
            <div className="text-[11.5px] text-faint">Customer Portal</div>
          </div>
        </div>
        <div className="flex items-center gap-[18px]">
          <Button variant="ghost" className="hidden lg:inline-flex" onClick={() => setHelpOpen(true)}>
            ? Help
          </Button>
          {me.data && (
            <>
              <p className="hidden text-[13px] text-muted-foreground lg:block">
                Viewing <strong className="text-foreground">{me.data.account.company}</strong> · {me.data.account.customerName}
              </p>
              <UserMenu name={me.data.contact.name} />
            </>
          )}
        </div>
      </header>
      {sections.length > 0 && (
        <nav
          ref={navRef}
          aria-label="Portal sections"
          className="mb-2 flex gap-1.5 overflow-x-auto border-b pb-3.5 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible"
        >
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
