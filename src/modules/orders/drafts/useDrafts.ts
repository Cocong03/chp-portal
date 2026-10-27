import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, serverLogic } from '@/api/serverLogic'
import type { DraftDto } from '@/api/types'
import type { NewOrderForm } from '../new/form'
import { toPayload } from './draftPayload'

type Answer = DraftDto | { notFound: true } | { invalid: true }

/** The signed-in contact's drafts, newest first. ['drafts', id] holds one draft; invalidating ['drafts'] refreshes both. */
export function useDrafts() {
  return useQuery({ queryKey: ['drafts'], queryFn: () => serverLogic<DraftDto[]>('drafts') })
}

/** One draft; null when it no longer exists (or isn't this contact's). */
export function useDraft(id: string | null) {
  return useQuery({
    queryKey: ['drafts', id],
    queryFn: async () => {
      const answer = await serverLogic<Answer>('drafts', { query: { id: id! } })
      return 'id' in answer ? answer : null
    },
    enabled: id !== null,
  })
}

function saved(answer: Answer): DraftDto {
  if ('id' in answer) return answer
  throw new ApiError(400, "This draft couldn't be saved.")
}

/** Updates the draft `id`, or creates one: without an id, or when that draft was removed meanwhile (spec section 4). */
export async function saveDraft(id: string | null, form: NewOrderForm): Promise<DraftDto> {
  const body = { payload: toPayload(form) }
  if (id) {
    const answer = await serverLogic<Answer>('drafts', { method: 'PUT', query: { id }, body })
    if (!('notFound' in answer)) return saved(answer)
  }
  return saved(await serverLogic<Answer>('drafts', { method: 'POST', body }))
}

/** Removes a draft (already gone counts as removed) and refreshes the list. */
export function useDeleteDraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => serverLogic('drafts', { method: 'DELETE', query: { id } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['drafts'] }),
  })
}
