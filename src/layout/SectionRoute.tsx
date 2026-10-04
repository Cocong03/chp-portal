import { Navigate } from 'react-router-dom'
import { canSee } from '@/auth/access'
import { useMe } from '@/auth/useMe'
import type { Section } from '@/layout/sections'
import { Placeholder } from '@/modules/Placeholder'

/** UX-only guard. AppShell renders routes only once `me` has loaded; Server Logic web roles are the security. */
export function SectionRoute({ section }: { section: Section }) {
  const { data } = useMe()
  if (!data || !canSee(data.roles, section.key)) return <Navigate to="/" replace />
  return <Placeholder label={section.label} />
}
