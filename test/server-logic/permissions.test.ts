import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const dir = resolve('.powerpages-site/table-permissions')
const permissions = readdirSync(dir).map((file) => {
  const text = readFileSync(join(dir, file), 'utf8')
  const field = (key: string) => text.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1]?.trim()
  return { file, text, field }
})
const named = (name: string) => permissions.find((p) => p.field('entityname') === name)

// Seen on Dev 2026-10-08: company failed with "dataverse 403 … You don't have permission to read the
// powerpagecomponent table" — web roles live in powerpagecomponent, and the Contacts list expands them.
test("coworkers' web roles are readable only through the same-account Contact permission", () => {
  const contacts = named('Contact - same account (read)')!
  const roles = named("Web roles of same-account contacts (read)")
  expect(roles, 'missing child permission for powerpagecomponent').toBeDefined()
  expect(roles!.field('entitylogicalname')).toBe('powerpagecomponent')
  expect(roles!.field('scope')).toBe('756150003') // Parent: never Global — this table also holds site settings and code
  expect(roles!.field('parententitypermission')).toBe(contacts.field('id'))
  expect(roles!.field('parentrelationship')).toBe('powerpagecomponent_mspp_webrole_contact')
  for (const privilege of ['create', 'write', 'delete', 'append', 'appendto']) expect(roles!.field(privilege)).toBe('false')
  expect(roles!.field('read')).toBe('true')
})

test('no table permission grants Global access to powerpagecomponent', () => {
  for (const p of permissions.filter((p) => p.field('entitylogicalname') === 'powerpagecomponent')) {
    expect(p.field('scope'), p.file).not.toBe('756150000')
  }
})

// Seen on Dev 2026-10-21: drafts POST failed with "Permission denied for (chp_orderdraft, AppendTo)" — binding the
// contact and account lookups on create needs Append and AppendTo on the draft's own (Contact-scope) permission.
test('order drafts: own drafts only, with the append rights the lookups need', () => {
  const drafts = named('Order draft - own (CRUD)')!
  expect(drafts.field('entitylogicalname')).toBe('chp_orderdraft')
  expect(drafts.field('scope')).toBe('756150001') // Contact: never Global or Account — drafts are personal
  expect(drafts.field('contactrelationship')).toBe('chp_contact_chp_orderdraft')
  for (const privilege of ['read', 'create', 'write', 'delete', 'append', 'appendto']) expect(drafts.field(privilege), privilege).toBe('true')
})
