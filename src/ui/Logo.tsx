import { cn } from '@/lib/utils'

/** Concreat logo supplied by the client (public/concreat-logo.webp, 500×327). It includes the CONCREAT wordmark. */
export function Logo({ className }: { className?: string }) {
  return <img src="/concreat-logo.webp" alt="Concreat" width={500} height={327} className={cn('h-10 w-auto shrink-0', className)} />
}
