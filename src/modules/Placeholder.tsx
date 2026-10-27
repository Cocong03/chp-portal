import { usePageTitle } from '@/lib/usePageTitle'
import { PageHeader } from '@/ui/PageHeader'

// Stand-in for every section until its module is built (S2+). Replace per route, then add React.lazy.
export function Placeholder({ label }: { label: string }) {
  usePageTitle(label)
  return <PageHeader title={label} caption="This section is coming soon." />
}
