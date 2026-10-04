import type { ReactNode } from 'react'
import { ClipboardList, FileText, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/ui/Logo'

// Wireframe #auth-signin brand screen. Fixed light palette (DESIGN.md §7), whatever the app theme.

const FEATURES = [
  { icon: LayoutGrid, title: 'See your account at a glance', desc: 'Available credit, open orders, and customer ledger.' },
  { icon: ClipboardList, title: 'Order and re-order in minutes', desc: 'Place, repeat a previous order, and schedule deliveries.' },
  { icon: FileText, title: 'Everything on record', desc: 'Invoices, delivery receipts, and other documents ready to view and download.' },
]

const BRANDS = [
  { name: 'APO', pill: 'APO CEMENT', ribbon: 'bg-primary' },
  { name: 'RIZAL', pill: 'RIZAL CEMENT', ribbon: 'bg-destructive' },
  { name: 'ISLAND', pill: 'ISLAND CEMENT', ribbon: 'bg-brand-ink' },
]

export const labelClass = 'text-[12.5px] font-semibold text-muted-foreground'
export const inputClass = 'h-auto border-brand-field bg-card px-3 py-2.5 text-[13.5px]'
export const brandButton = 'h-auto w-full rounded-[7px] bg-brand-navy py-3 text-sm font-bold text-white hover:bg-brand-navy'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" className="flex min-h-screen flex-wrap bg-card text-foreground">
      <div className="flex flex-[1_1_560px] flex-col justify-center px-[clamp(24px,6vw,76px)] py-[clamp(32px,5vw,64px)]">
        <div className="mb-[34px] flex items-center gap-3.5">
          <Logo size={50} />
          <span className="text-[21px] font-extrabold tracking-[0.01em] text-brand-ink">CONCREAT</span>
        </div>
        <p className="mb-1.5 text-xs font-bold tracking-[0.12em] text-brand-blue uppercase">Welcome to</p>
        <h1 className="mb-1.5 text-[clamp(28px,3.4vw,38px)] leading-[1.08] font-extrabold text-balance text-brand-ink">
          Concreat Connect
        </h1>
        <p className="mb-4 text-[clamp(19px,2.2vw,25px)] font-extrabold">One hub for every order.</p>
        <p className="mb-[26px] max-w-[520px] text-sm leading-[1.55] text-muted-foreground">
          Concreat Connect gives you a secure view of every account registered to your email across APO Cement Corporation and
          Solid Cement Corporation — orders, deliveries, credit, and documents in one place.
        </p>
        <ul className="mb-[30px] flex max-w-[480px] flex-col gap-[15px]">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex items-start gap-[13px]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary" aria-hidden="true">
                <Icon size={15} strokeWidth={2} />
              </span>
              <div>
                <div className="text-[13.5px] font-bold">{title}</div>
                <div className="mt-0.5 text-[12.5px] text-muted-foreground">{desc}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-[18px]">
          {BRANDS.map((brand) => (
            <div key={brand.name} className="flex flex-col items-center gap-[9px]">
              <div
                aria-hidden="true"
                className="relative flex h-[98px] w-[74px] flex-col items-center justify-center overflow-hidden rounded-md border border-brand-field bg-linear-180 from-muted to-border text-center"
              >
                <div className={cn('absolute top-[9px] -right-[25px] h-[15px] w-20 rotate-40', brand.ribbon)} />
                <div className="text-[11.5px] font-extrabold tracking-[0.01em]">{brand.name}</div>
                <div className="mt-[3px] text-[8px] font-semibold tracking-[0.03em] text-muted-foreground uppercase">Portland Cement</div>
              </div>
              <span className="rounded-full bg-brand-soft px-[11px] py-1 text-[10.5px] font-bold tracking-[0.02em] whitespace-nowrap text-accent-foreground">
                {brand.pill}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-[1_1_420px] items-center justify-center bg-linear-160 from-brand-navy to-brand-navy-deep px-[26px] py-10">
        <div className="w-full max-w-[420px] rounded-[14px] bg-card px-[34px] py-9 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">{children}</div>
      </div>
    </div>
  )
}

export function AuthCardHeader({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <>
      <h2 className="mb-2 text-center text-[23px] font-extrabold text-brand-ink">{title}</h2>
      {sub && <p className="mb-[26px] text-center text-[13px] text-muted-foreground">{sub}</p>}
    </>
  )
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-4 rounded-lg bg-destructive-soft px-3 py-2 text-[12.5px] text-destructive">
      {children}
    </p>
  )
}

export function ActivationNote() {
  return (
    <p className="mt-[5px] text-center text-[11.5px] text-faint">
      For existing Concreat Holdings customers only — new accounts are set up by your account manager.
    </p>
  )
}

export function SupportLine() {
  return (
    <p className="mt-4 border-t border-brand-divider pt-4 text-center text-xs text-muted-foreground">
      Need assistance? Contact <strong>Concreat Customer Service Center</strong> at <strong>(02) 8849-3600</strong>.
    </p>
  )
}
