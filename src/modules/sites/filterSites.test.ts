import type { SiteDto } from '@/api/types'
import { filterSites } from './filterSites'

const site = (code: string, name: string, city: string): SiteDto => ({
  code, name, city, address: '', contact: '', phone: '', email: '', isDefault: false,
})
const SITES = [site('PLANT1', 'Plant 1 — Main Yard', 'Antipolo City, Rizal'), site('PLANT2', 'Plant 2 — North Depot', 'Angat, Bulacan')]

test.each([
  ['code', 'plant2', ['PLANT2']],
  ['name', 'main yard', ['PLANT1']],
  ['city', 'BULACAN', ['PLANT2']],
  ['trimmed query', '  antipolo  ', ['PLANT1']],
  ['no match', 'cebu', []],
  ['blank query', '   ', ['PLANT1', 'PLANT2']],
])('matches by %s', (_case, query, codes) => {
  expect(filterSites(SITES, query).map((s) => s.code)).toEqual(codes)
})
