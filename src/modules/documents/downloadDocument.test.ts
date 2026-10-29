import { downloadDocument } from './downloadDocument'

const serverLogic = vi.hoisted(() => vi.fn())
vi.mock('@/api/serverLogic', () => ({ serverLogic }))

afterEach(() => vi.restoreAllMocks())

test('downloads the PDF under its file name and revokes the URL', async () => {
  serverLogic.mockResolvedValue({ fileName: 'Invoice INV-1.pdf', contentType: 'application/pdf', base64: btoa('%PDF-1.4') })
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:x')
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
  let downloaded = ''
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloaded = this.download
  })

  await downloadDocument({ type: 'Invoice', ref: 'INV-1' })

  expect(serverLogic).toHaveBeenCalledWith('document-file', { query: { type: 'Invoice', no: 'INV-1' } })
  const blob = createObjectURL.mock.calls[0][0]
  expect(blob.type).toBe('application/pdf')
  expect(await blob.text()).toBe('%PDF-1.4')
  expect(downloaded).toBe('Invoice INV-1.pdf')
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:x')
})

test('rejects when the document is not found', async () => {
  serverLogic.mockResolvedValue({ notFound: true })
  await expect(downloadDocument({ type: 'Invoice', ref: 'X' })).rejects.toThrow('notFound')
})
