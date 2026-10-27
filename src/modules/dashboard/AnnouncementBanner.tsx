import { Alert, AlertDescription, AlertTitle } from '@/ui/alert'
import { useAnnouncement } from './useAnnouncement'

/** Wireframe announcement banner (DESIGN.md §5). Renders nothing when there's no active announcement or the read fails. */
export function AnnouncementBanner() {
  const { data } = useAnnouncement()
  if (!data) return null
  return (
    <Alert className="mb-5 block rounded-xl border-l-4 border-l-primary bg-accent px-5 py-4">
      <p className="mb-1 text-[11px] font-bold tracking-wider text-accent-foreground uppercase">Announcement</p>
      <AlertTitle className="mb-1 text-base font-bold text-foreground">{data.title}</AlertTitle>
      <AlertDescription className="max-w-[62ch] text-[13px] text-muted-foreground">{data.message}</AlertDescription>
    </Alert>
  )
}
