import { serverLogic } from '@/api/serverLogic'
import { createNote } from '@/api/webApi'
import { attachFile, contactSchema, readAttachment } from './serviceForm'

vi.mock('@/api/webApi', () => ({ createNote: vi.fn() }))
vi.mock('@/api/serverLogic', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/serverLogic')>()), serverLogic: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

test('readAttachment rejects over 3.75 MB and disallowed types, and base64-encodes the rest', async () => {
  expect(await readAttachment(new File([new Uint8Array(3_932_161)], 'a.pdf'), 'request')).toEqual({
    error: 'This file is too large. Attach a file of 3.75 MB or less.',
  })
  expect(await readAttachment(new File([new Uint8Array(3_932_160)], 'a.pdf'), 'request')).toMatchObject({ name: 'a.pdf' })
  expect(await readAttachment(new File(['x'], 'x.exe'), 'request')).toEqual({
    error: "This file type can't be attached. Use a PDF, Word, Excel or image file.",
  })
  expect(await readAttachment(new File(['x'], 'list.xlsx'), 'request')).toMatchObject({ name: 'list.xlsx' })
  expect(await readAttachment(new File(['x'], 'list.xlsx'), 'complaint')).toEqual({
    error: "This file type can't be attached. Use a PDF, Word or image file.",
  })
  expect(await readAttachment(new File(['hello'], 'dr.pdf'), 'request')).toEqual({ name: 'dr.pdf', base64: 'aGVsbG8=' })
  expect(await readAttachment(new File(['x'], 'PHOTO.JPG'), 'complaint')).toMatchObject({ name: 'PHOTO.JPG' })
})

const ID = '33333333-3333-4333-8333-333333333333'
const PHOTO = { name: 'PHOTO.JPG', base64: 'aGVsbG8=' }

test('attachFile uploads the note to the saved row with the type the server expects, then lets the server release it', async () => {
  vi.mocked(serverLogic).mockResolvedValue({ ref: 'CMP-1', attached: true })
  expect(await attachFile('complaint', ID, PHOTO)).toBe(true)
  expect(createNote).toHaveBeenCalledWith('chp_complaint', ID, PHOTO, 'image/jpeg')
  expect(serverLogic).toHaveBeenCalledWith('complaints', { method: 'PUT', body: { id: ID } })
})

test('attachFile still releases the row when the upload fails, and reports the file as not attached', async () => {
  vi.mocked(createNote).mockRejectedValue(new Error('413'))
  vi.mocked(serverLogic).mockResolvedValue({ ref: 'RQ-1', attached: false })
  expect(await attachFile('request', ID, PHOTO)).toBe(false)
  expect(serverLogic).toHaveBeenCalledWith('requests', { method: 'PUT', body: { id: ID } })
})

test('attachFile answers false, not an error, when the release fails or the row id is unknown (the row is saved either way)', async () => {
  vi.mocked(serverLogic).mockRejectedValue(new Error('500'))
  expect(await attachFile('request', ID, PHOTO)).toBe(false)
  vi.clearAllMocks()
  expect(await attachFile('request', '', PHOTO)).toBe(false)
  expect(createNote).not.toHaveBeenCalled()
  expect(serverLogic).not.toHaveBeenCalled()
})

test('contactSchema accepts 0917 552 6613 and +639175526613, rejects 12345 and a bad email', () => {
  const ok = (contactMethod: string, contactValue: string) => contactSchema.safeParse({ contactMethod, contactValue }).success
  expect(ok('Mobile', '0917 552 6613')).toBe(true)
  expect(ok('Mobile', '+639175526613')).toBe(true)
  expect(ok('Mobile', '12345')).toBe(false)
  expect(ok('Email', 'a@b.ph')).toBe(true)
  expect(ok('Email', 'nope')).toBe(false)
})
