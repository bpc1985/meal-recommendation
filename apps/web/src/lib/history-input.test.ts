import { describe, expect, it } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  historyDeleteSchema,
  historyQuerySchema,
  parseHistorySearch,
  type HistorySearch,
} from './history-input'
import { parseSearch } from './search-params'

describe('historyQuerySchema', () => {
  it('nhận trang đầu khi không truyền gì', () => {
    expect(historyQuerySchema.parse({})).toEqual({})
  })

  it('nhận bữa hợp lệ và số trang', () => {
    expect(historyQuerySchema.parse({ mealType: 'lunch', page: 3 })).toEqual({
      mealType: 'lunch',
      page: 3,
    })
  })

  it('từ chối bữa lạ', () => {
    expect(historyQuerySchema.safeParse({ mealType: 'brunch' }).success).toBe(false)
  })

  it('từ chối trang 0, trang âm, trang lẻ và trang quá lớn', () => {
    for (const page of [0, -1, 1.5, 100_001, '2']) {
      expect(historyQuerySchema.safeParse({ page }).success, String(page)).toBe(false)
    }
  })

  it('không nhận cursor nữa — tham số lạ bị bỏ', () => {
    expect(historyQuerySchema.parse({ cursor: '1:batch' })).toEqual({})
  })
})

describe('historyDeleteSchema', () => {
  it('từ chối batchId rỗng', () => {
    expect(historyDeleteSchema.safeParse({ batchId: '  ' }).success).toBe(false)
    expect(historyDeleteSchema.safeParse({ batchId: 'batch-1' }).success).toBe(true)
  })
})

describe('parseHistorySearch', () => {
  it('đọc trang và bữa hợp lệ từ URL', () => {
    expect(parseHistorySearch({ page: 2, meal: 'lunch' })).toEqual({ page: 2, meal: 'lunch' })
    expect(parseHistorySearch({ page: '3' })).toEqual({ page: 3 })
  })

  it('trang 1 bị bỏ khỏi URL', () => {
    expect(parseHistorySearch({ page: 1 })).toEqual({})
  })

  it('giá trị rác bị bỏ, không ném lỗi', () => {
    expect(parseHistorySearch({ page: 'abc', meal: 'brunch' })).toEqual({})
    expect(parseHistorySearch({ page: 0 })).toEqual({})
    expect(parseHistorySearch({ page: -2, meal: 7 })).toEqual({})
    expect(parseHistorySearch({ page: 2.5 })).toEqual({})
    expect(parseHistorySearch({ page: 10_000_000 })).toEqual({})
  })
})

/** Đi qua router thật: router ghép search thô của URL với kết quả `validateSearch`. */
function searchAt(href: string): HistorySearch {
  const rootRoute = createRootRoute()
  const historyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/history',
    validateSearch: parseHistorySearch,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([historyRoute]),
    history: createMemoryHistory({ initialEntries: [href] }),
    parseSearch,
  })
  return router.matchRoutes(router.state.location).at(-1)?.search as HistorySearch
}

describe('URL /history qua router', () => {
  it.each(['/history?page=abc', '/history?page=0', '/history?page=1', '/history?meal=brunch'])(
    '%s: tham số rác không lọt tới loader (trang 1, mọi bữa)',
    (href) => {
      const search = searchAt(href)

      expect(search.page).toBeUndefined()
      expect(search.meal).toBeUndefined()
    },
  )

  it('giữ tham số hợp lệ đi cùng tham số rác', () => {
    expect(searchAt('/history?page=3&meal=brunch')).toMatchObject({ page: 3, meal: undefined })
  })
})
