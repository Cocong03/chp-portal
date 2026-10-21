import { usePageTitle } from '@/lib/usePageTitle'
import { PageHeader } from '@/ui/PageHeader'

/** New Order (S3-07/S3-08), built to the wireframe's `#panel-new`. */
export function NewOrderPage() {
  usePageTitle('New Order')
  return <PageHeader title="New Order" />
}
