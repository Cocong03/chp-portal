import { usePageTitle } from '@/lib/usePageTitle'
import { PageHeader } from '@/ui/PageHeader'

// Signed in but no business web role yet (decision D4 default: CHP ops assigns roles).
export function NoAccess() {
  usePageTitle('Access pending')
  return (
    <PageHeader
      title="Your portal access is being set up"
      caption="Contact your account manager or the Concreat Customer Service Center at (02) 8849-3600."
    />
  )
}
