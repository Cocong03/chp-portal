import { act, renderHook } from '@testing-library/react'
import { usePaged } from './usePaged'

const rows = Array.from({ length: 23 }, (_, i) => i + 1)

test('pages 10 rows at a time and clamps to the last page when rows shrink', () => {
  const { result, rerender } = renderHook(({ list }) => usePaged(list), { initialProps: { list: rows } })
  expect(result.current).toMatchObject({ page: 1, pageSize: 10, total: 23 })
  expect(result.current.pageRows).toEqual(rows.slice(0, 10))
  act(() => result.current.onPage(3))
  expect(result.current.pageRows).toEqual([21, 22, 23])
  rerender({ list: rows.slice(0, 15) })
  expect(result.current.page).toBe(2)
  expect(result.current.pageRows).toEqual(rows.slice(10, 15))
  rerender({ list: [] })
  expect(result.current).toMatchObject({ page: 1, total: 0, pageRows: [] })
})
