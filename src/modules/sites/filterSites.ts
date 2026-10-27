import type { SiteDto } from '@/api/types'

/** Wireframe search: site code, name or city, case-insensitive. A blank query keeps every site. */
export function filterSites(sites: SiteDto[], query: string): SiteDto[] {
  const q = query.trim().toLowerCase()
  if (!q) return sites
  return sites.filter((site) => [site.code, site.name, site.city].some((value) => value.toLowerCase().includes(q)))
}
