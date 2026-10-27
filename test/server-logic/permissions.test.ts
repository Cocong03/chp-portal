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

// Seen on Dev 2026-10-21 (after AppendTo): "Permission denied for (contact, Append)". The draft's contact and account
// lookups need Append on the user's own contact and account, granted only to the roles that can order.
test.each([
  ['Contact - self (append, order drafts)', 'contact', '756150004', undefined],
  ['Account - own account (append, order drafts)', 'account', '756150001', 'contact_customer_accounts'],
])('%s: Append only, own record only, ordering roles only', (name, table, scope, relationship) => {
  const p = named(name)
  expect(p, `missing ${name}`).toBeDefined()
  expect(p!.field('entitylogicalname')).toBe(table)
  expect(p!.field('scope')).toBe(scope)
  expect(p!.field('contactrelationship')).toBe(relationship)
  expect(p!.field('append')).toBe('true')
  for (const privilege of ['read', 'create', 'write', 'delete', 'appendto']) expect(p!.field(privilege), privilege).toBe('false')
  expect(p!.text).toContain('- 56b29291-b981-4ef0-865b-41c1e9523a97') // Full Access
  expect(p!.text).toContain('- 11bb7218-55fb-4cae-b8a1-5af2f41237c5') // Orders & Delivery
  expect(p!.text).not.toContain('b2780841-e908-44f8-b7d8-dfd367bfeeb2') // never all Authenticated Users
})

test('credit approvals: the account sees its held orders; only the flow changes them', () => {
  const p = named('Credit approval - account (read, create)')!
  expect(p.field('entitylogicalname')).toBe('chp_creditapproval')
  expect(p.field('scope')).toBe('756150002') // Account
  expect(p.field('accountrelationship')).toBe('chp_account_chp_creditapproval')
  for (const privilege of ['read', 'create', 'append', 'appendto']) expect(p.field(privilege), privilege).toBe('true')
  for (const privilege of ['write', 'delete']) expect(p.field(privilege), privilege).toBe('false')
  expect(p.text).toContain('- 56b29291-b981-4ef0-865b-41c1e9523a97')
  expect(p.text).toContain('- 11bb7218-55fb-4cae-b8a1-5af2f41237c5')
  expect(p.text).not.toContain('b2780841-e908-44f8-b7d8-dfd367bfeeb2')
})

// S4-04: requests belong to the customer's account; the note permission hangs off the request permission (never Global).
test('requests: own-account rows, read + create + append only, ordering roles only', () => {
  const p = named('Request - own account (read, create)')!
  expect(p.field('entitylogicalname')).toBe('chp_request')
  expect(p.field('scope')).toBe('756150002') // Account
  expect(p.field('accountrelationship')).toBe('chp_account_chp_request')
  for (const privilege of ['read', 'create', 'append', 'appendto']) expect(p.field(privilege), privilege).toBe('true')
  for (const privilege of ['write', 'delete']) expect(p.field(privilege), privilege).toBe('false')
  expect(p.text).toContain('- 56b29291-b981-4ef0-865b-41c1e9523a97') // Full Access
  expect(p.text).toContain('- 11bb7218-55fb-4cae-b8a1-5af2f41237c5') // Orders & Delivery
  expect(p.text).not.toContain('b2780841-e908-44f8-b7d8-dfd367bfeeb2') // never all Authenticated Users
  const types = named('Request type (read)')!
  expect(types.field('entitylogicalname')).toBe('chp_requesttype')
  expect(types.field('scope')).toBe('756150000')
  expect([types.field('read'), types.field('create'), types.field('write'), types.field('delete')]).toEqual(['true', 'false', 'false', 'false'])
})

test('request notes: parent scope through the request permission, never Global', () => {
  const note = named('Request note (create)')!
  expect(note.field('entitylogicalname')).toBe('annotation')
  expect(note.field('scope')).toBe('756150003')
  expect(note.field('parententitypermission')).toBe(named('Request - own account (read, create)')!.field('id'))
  expect(note.field('parentrelationship')).toBe('chp_request_Annotations')
  for (const privilege of ['create', 'read', 'append']) expect(note.field(privilege), privilege).toBe('true')
  for (const privilege of ['write', 'delete', 'appendto']) expect(note.field(privilege), privilege).toBe('false')
})


// S4-05: complaints are Full Access only; the permissions mirror the requests ones.
test('complaints: own-account rows, read + create + append only, Full Access only', () => {
  const p = named('Complaint - own account (read, create)')!
  expect(p.field('entitylogicalname')).toBe('chp_complaint')
  expect(p.field('scope')).toBe('756150002') // Account
  expect(p.field('accountrelationship')).toBe('chp_account_chp_complaint')
  for (const privilege of ['read', 'create', 'append', 'appendto']) expect(p.field(privilege), privilege).toBe('true')
  for (const privilege of ['write', 'delete']) expect(p.field(privilege), privilege).toBe('false')
  const types = named('Complaint type (read)')!
  expect(types.field('entitylogicalname')).toBe('chp_complainttype')
  expect(types.field('scope')).toBe('756150000')
  expect([types.field('read'), types.field('create'), types.field('write'), types.field('delete')]).toEqual(['true', 'false', 'false', 'false'])
  for (const each of [p, types, named('Complaint note (create)')!]) {
    expect(each.text, each.file).toContain('- 56b29291-b981-4ef0-865b-41c1e9523a97') // Full Access
    expect(each.text, each.file).not.toContain('11bb7218') // Orders & Delivery
    expect(each.text, each.file).not.toContain('b2780841-e908-44f8-b7d8-dfd367bfeeb2') // never all Authenticated Users
  }
})

test('complaint notes: parent scope through the complaint permission, never Global', () => {
  const note = named('Complaint note (create)')!
  expect(note.field('entitylogicalname')).toBe('annotation')
  expect(note.field('scope')).toBe('756150003')
  expect(note.field('parententitypermission')).toBe(named('Complaint - own account (read, create)')!.field('id'))
  expect(note.field('parentrelationship')).toBe('chp_complaint_Annotations')
  for (const privilege of ['create', 'read', 'append']) expect(note.field(privilege), privilege).toBe('true')
  for (const privilege of ['write', 'delete', 'appendto']) expect(note.field(privilege), privilege).toBe('false')
})

test('complaints: Full Access only — Orders & Delivery never sees complaints', () => {
  const yml = readFileSync(resolve('.powerpages-site/server-logic/complaints/complaints.serverlogic.yml'), 'utf8')
  expect(yml).toContain('56b29291-b981-4ef0-865b-41c1e9523a97')
  expect(yml).not.toContain('11bb7218')
})
