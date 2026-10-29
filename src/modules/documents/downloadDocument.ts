import { serverLogic } from '@/api/serverLogic'
import type { DocumentDto, DocumentFileDto } from '@/api/types'

/** Fetches the document's PDF (base64 JSON from BC) and saves it through a temporary link. Throws 'notFound' if BC has no such document. */
export async function downloadDocument(doc: Pick<DocumentDto, 'type' | 'ref'>): Promise<void> {
  const file = await serverLogic<DocumentFileDto | { notFound: true }>('document-file', { query: { type: doc.type, no: doc.ref } })
  if ('notFound' in file) throw new Error('notFound')
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName
  link.click()
  URL.revokeObjectURL(url)
}
