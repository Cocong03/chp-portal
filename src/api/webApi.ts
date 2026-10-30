import { fetchAntiForgeryToken } from '@/auth/session'
import { ApiError, GENERIC_ERROR } from './serverLogic'
import type { AttachmentDto } from './types'

/**
 * Attaches a file to a portal row as a note, straight through the Power Pages Web API (S4-04/S4-05). Files don't go
 * through Server Logic: Power Pages refuses a ~2 MB Server Logic body. Table permissions only allow a note on the
 * customer's own row; the row's Server Logic PUT then checks the note before the row is sent on.
 */
export async function createNote(table: 'chp_request' | 'chp_complaint', id: string, file: AttachmentDto, mimetype: string): Promise<void> {
  if (import.meta.env.DEV) return
  const response = await fetch('/_api/annotations', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      __RequestVerificationToken: await fetchAntiForgeryToken(),
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      subject: file.name,
      filename: file.name,
      mimetype,
      documentbody: file.base64,
      [`objectid_${table}@odata.bind`]: `/${table}s(${id})`,
    }),
  })
  if (!response.ok) throw new ApiError(response.status, GENERIC_ERROR)
}
