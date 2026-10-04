import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ChevronRight, CircleHelp, Menu } from 'lucide-react'
import type { MeDto } from '@/api/types'
import type { Section } from '@/layout/sections'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/ui/avatar'
import { Button } from '@/ui/button'
import { Logo } from '@/ui/Logo'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/sheet'
import { initials } from './UserMenu'

const item = 'flex items-center gap-3.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted'

/** Phones and tablets (below lg): hamburger + left drawer with the role's sections, Help and the account. */
export function MobileMenu({ sections, me, onHelp }: { sections: Section[]; me: MeDto | undefined; onHelp: () => void }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="-ml-2 text-foreground lg:hidden">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85%] max-w-[320px] gap-0 bg-card p-0 sm:max-w-[320px]">
        <SheetHeader className="flex-row items-center gap-2.5 px-5 pt-5 pb-4">
          <Logo className="h-9" />
          <div>
            <SheetTitle className="text-[15.5px] font-bold">Concreat Connect</SheetTitle>
            <SheetDescription className="text-[11.5px] text-faint">Customer Portal</SheetDescription>
          </div>
        </SheetHeader>
        <nav aria-label="Menu" className="flex flex-col gap-1 px-3">
          {sections.map(({ key, path, label, icon: Icon }) => (
            <NavLink
              key={key}
              to={path}
              end={path === '/'}
              onClick={close}
              className={({ isActive }) => cn(item, isActive && 'bg-accent font-semibold text-accent-foreground hover:bg-accent')}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mx-5 my-3 border-t" />
        <button
          type="button"
          className={cn(item, 'mx-3')}
          onClick={() => {
            close()
            onHelp()
          }}
        >
          <CircleHelp className="size-5 shrink-0" aria-hidden="true" />
          Help
        </button>
        {me?.account && (
          <Link to="/account" onClick={close} className="mt-auto flex items-center gap-3 border-t px-5 py-4 hover:bg-muted">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">{initials(me.contact.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-snug font-semibold">{me.account.customerName}</span>
              <span className="block text-[11.5px] text-faint">{me.account.company}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        )}
      </SheetContent>
    </Sheet>
  )
}
