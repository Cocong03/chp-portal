import { contactSchema, readAttachment } from './serviceForm'

test('readAttachment rejects over 250 KB and disallowed types, and base64-encodes the rest', async () => {
  expect(await readAttachment(new File([new Uint8Array(256_001)], 'a.pdf'), 'request')).toEqual({
    error: 'This file is too large. Attach a file of 250 KB or less.',
  })
  expect(await readAttachment(new File([new Uint8Array(256_000)], 'a.pdf'), 'request')).toMatchObject({ name: 'a.pdf' })
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

test('contactSchema accepts 0917 552 6613 and +639175526613, rejects 12345 and a bad email', () => {
  const ok = (contactMethod: string, contactValue: string) => contactSchema.safeParse({ contactMethod, contactValue }).success
  expect(ok('Mobile', '0917 552 6613')).toBe(true)
  expect(ok('Mobile', '+639175526613')).toBe(true)
  expect(ok('Mobile', '12345')).toBe(false)
  expect(ok('Email', 'a@b.ph')).toBe(true)
  expect(ok('Email', 'nope')).toBe(false)
})
