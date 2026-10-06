import { signOut } from '@/auth/session'
import { usePageTitle } from '@/lib/usePageTitle'
import { Button } from '@/ui/button'
import { PageHeader } from '@/ui/PageHeader'

// BC switched this contact's portal access off (customerPortalAccess = false, decided 2026-10-06).
export function AccessBlocked() {
  usePageTitle('Access turned off')
  return (
    <div className="flex flex-col items-start gap-4">
      <PageHeader
        title="Your access has been turned off"
        caption="Your access to Concreat Connect has been turned off. Please contact the Concreat Customer Service Center at (02) 8849-3600."
      />
      <Button variant="outline" onClick={signOut}>
        Sign out
      </Button>
    </div>
  )
}
