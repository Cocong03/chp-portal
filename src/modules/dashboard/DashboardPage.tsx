import { usePageTitle } from '@/lib/usePageTitle'
import { PageHeader } from '@/ui/PageHeader'
import { AnnouncementBanner } from './AnnouncementBanner'
import { Greeting } from './Greeting'

// Account overview and Sales Orders tiles arrive with S2 sub-project C.
export function DashboardPage() {
  usePageTitle('Dashboard')
  return (
    <>
      <PageHeader title="Dashboard" caption="This section is coming soon." />
      <Greeting />
      <AnnouncementBanner />
    </>
  )
}
