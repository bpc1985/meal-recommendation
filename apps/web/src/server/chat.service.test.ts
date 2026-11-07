import { createMockAdvisor, NO_PREFERENCES, type MealAdvisor } from '@mam/ai'
import { findDishCandidates, type Db } from '@mam/db'
import { createTestDb } from '@mam/db/testing'
import { mealTypes, type DishCandidate } from '@mam/domain'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runChat, type ChatEvent } from './chat.service'

async function collect(events: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const collected: ChatEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

function textOf(events: ChatEvent[]): string {
  return events
    .filter((event): event is { type: 'text'; text: string } => event.type === 'text')
    .map((event) => event.text)
    .join('')
}

function metaOf(events: ChatEvent[]) {
  const meta = events.find((event) => event.type === 'meta')
  if (!meta || meta.type !== 'meta') throw new Error('missing meta event')
  return meta
}

describe('runChat', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']

  beforeAll(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
  })

  afterAll(() => {
    sqlite.close()
  })

  it('phát text, meta kèm giá DB và kết thúc bằng done', async () => {
    const events = await collect(
      runChat(db, {
        messages: [{ role: 'user', content: 'Ăn trưa 40k giúp mình' }],
        context: {},
        locale: 'vi',
        preferences: NO_PREFERENCES,
      }),
    )

    const meta = metaOf(events)
    const prices = new Map(
      findDishCandidates(db, { mealType: 'lunch', maxPriceVnd: 500_000, limit: 1_000 }).map(
        (dish) => [dish.id, dish.priceVnd],
      ),
    )

    expect(textOf(events).length).toBeGreaterThan(0)
    expect(meta.degraded).toBe(false)
    expect(meta.dishes.length).toBeGreaterThan(0)
    for (const dish of meta.dishes) expect(prices.get(dish.id)).toBe(dish.priceVnd)
    expect(events.at(-1)?.type).toBe('done')
  })

  it('chỉ lấy ứng viên đúng bữa được hỏi', async () => {
    const events = await collect(
      runChat(db, {
        messages: [{ role: 'user', content: 'Bữa sáng 30k' }],
        context: { mealType: 'dinner', dailyBudgetVnd: 150_000 },
        locale: 'vi',
        preferences: NO_PREFERENCES,
      }),
    )

    const meta = metaOf(events)

    expect(meta.dishes.length).toBeGreaterThan(0)
    for (const dish of meta.dishes) expect(dish.mealTypes).toContain('breakfast')
  })

  it('chế độ ăn trong context được áp vào ứng viên', async () => {
    const events = await collect(
      runChat(db, {
        messages: [{ role: 'user', content: 'Gợi ý bữa tối' }],
        context: { dailyBudgetVnd: 150_000, dietTags: ['vegetarian'] },
        locale: 'vi',
        preferences: NO_PREFERENCES,
      }),
    )

    const vegetarianIds = new Set(
      mealTypes.flatMap((mealType) =>
        findDishCandidates(db, {
          mealType,
          maxPriceVnd: 500_000,
          dietTags: ['vegetarian'],
          limit: 1_000,
        }).map((dish) => dish.id),
      ),
    )

    for (const dish of metaOf(events).dishes) expect(vegetarianIds.has(dish.id)).toBe(true)
  })

  it('ngân sách quá thấp → không có thẻ món, vẫn trả lời được', async () => {
    const events = await collect(
      runChat(db, {
        messages: [{ role: 'user', content: 'Ăn tối 1k' }],
        context: {},
        locale: 'vi',
        preferences: NO_PREFERENCES,
      }),
    )

    expect(metaOf(events).dishes).toEqual([])
    expect(textOf(events).length).toBeGreaterThan(0)
    expect(events.at(-1)?.type).toBe('done')
  })

  it('ngân sách đi kèm bữa là ngân sách cho bữa đó, không phải cả ngày', async () => {
    const events = await collect(
      runChat(db, {
        messages: [{ role: 'user', content: 'Ăn trưa 40k món chay' }],
        context: {},
        locale: 'vi',
        preferences: NO_PREFERENCES,
      }),
    )

    const meta = metaOf(events)

    expect(meta.dishes.length).toBeGreaterThan(0)
    for (const dish of meta.dishes) {
      expect(dish.priceVnd).toBeLessThanOrEqual(40_000)
      expect(dish.mealTypes).toContain('lunch')
    }
    expect(meta.dishes.reduce((total, dish) => total + dish.priceVnd, 0)).toBeLessThanOrEqual(
      40_000,
    )
  })

  it('không phát trùng thẻ món khi một món phục vụ nhiều bữa', async () => {
    const events = await collect(
      runChat(db, {
        messages: [{ role: 'user', content: 'Hôm nay ăn gì với 90k?' }],
        context: {},
        locale: 'vi',
        preferences: NO_PREFERENCES,
      }),
    )

    const ids = events
      .filter((event): event is { type: 'dish'; dishId: string } => event.type === 'dish')
      .map((event) => event.dishId)

    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('không đưa quá 20 ứng viên cho advisor', async () => {
    let received: readonly DishCandidate[] = []

    const spy: MealAdvisor = {
      kind: 'mock',
      async pick() {
        return { picks: [], source: 'fallback', tip: '' }
      },
      async stream(request, candidates) {
        received = candidates
        return createMockAdvisor().stream(request, candidates)
      },
    }

    await collect(
      runChat(
        db,
        {
          messages: [{ role: 'user', content: 'Hôm nay ăn gì?' }],
          context: { dailyBudgetVnd: 200_000 },
          locale: 'vi',
          preferences: NO_PREFERENCES,
        },
        { advisor: spy },
      ),
    )

    expect(received.length).toBeGreaterThan(0)
    expect(received.length).toBeLessThanOrEqual(20)
  })

  it('advisor lỗi giữa chừng → degraded + fallback mock, không crash stream', async () => {
    const broken: MealAdvisor = {
      kind: 'gemini',
      async pick() {
        return { picks: [], source: 'fallback', tip: '' }
      },
      async stream() {
        throw new Error('upstream exploded')
      },
    }

    const events = await collect(
      runChat(
        db,
        {
          messages: [{ role: 'user', content: 'Ăn trưa 40k' }],
          context: {},
          locale: 'vi',
          preferences: NO_PREFERENCES,
        },
        { advisor: broken },
      ),
    )

    expect(metaOf(events).degraded).toBe(true)
    expect(textOf(events).length).toBeGreaterThan(0)
    expect(events.at(-1)?.type).toBe('done')
  })

  describe('món thích và món chán', () => {
    function spyAdvisor(seen: Set<string>): MealAdvisor {
      return {
        kind: 'mock',
        async pick() {
          return { picks: [], source: 'fallback', tip: '' }
        },
        async stream(request, candidates) {
          for (const dish of candidates) seen.add(dish.id)
          return createMockAdvisor().stream(request, candidates)
        },
      }
    }

    const ask = (content: string) => ({
      messages: [{ role: 'user' as const, content }],
      context: {},
      locale: 'vi' as const,
    })

    it('món chán không tới advisor và không thành thẻ món, kể cả khi là món rẻ nhất', async () => {
      const lunch = findDishCandidates(db, { mealType: 'lunch', maxPriceVnd: 40_000, limit: 1_000 })
      const cheapest = [...lunch].sort((a, b) => a.priceVnd - b.priceVnd)[0]!
      const firstEvents = await collect(
        runChat(db, { ...ask('trưa nay 40k ăn gì'), preferences: NO_PREFERENCES }),
      )
      const disliked = new Set([cheapest.id, ...metaOf(firstEvents).dishes.map((dish) => dish.id)])

      const seen = new Set<string>()
      const events = await collect(
        runChat(
          db,
          { ...ask('trưa nay 40k ăn gì'), preferences: { ...NO_PREFERENCES, disliked } },
          { advisor: spyAdvisor(seen) },
        ),
      )

      for (const id of disliked) expect(seen.has(id)).toBe(false)
      const shown = events.flatMap((event) => (event.type === 'dish' ? [event.dishId] : []))
      expect(shown.length).toBeGreaterThan(0)
      for (const id of shown) expect(disliked.has(id)).toBe(false)
      for (const dish of metaOf(events).dishes) expect(disliked.has(dish.id)).toBe(false)
    })

    it('advisor lỗi → fallback mock vẫn không nêu món chán', async () => {
      const firstEvents = await collect(
        runChat(db, { ...ask('trưa nay 40k ăn gì'), preferences: NO_PREFERENCES }),
      )
      const disliked = new Set(metaOf(firstEvents).dishes.map((dish) => dish.id))
      const broken: MealAdvisor = {
        kind: 'gemini',
        async pick() {
          return { picks: [], source: 'fallback', tip: '' }
        },
        async stream() {
          throw new Error('upstream exploded')
        },
      }

      const events = await collect(
        runChat(
          db,
          { ...ask('trưa nay 40k ăn gì'), preferences: { ...NO_PREFERENCES, disliked } },
          { advisor: broken },
        ),
      )

      expect(metaOf(events).degraded).toBe(true)
      expect(metaOf(events).dishes.length).toBeGreaterThan(0)
      for (const dish of metaOf(events).dishes) expect(disliked.has(dish.id)).toBe(false)
    })

    it('món thích vừa ngân sách đứng đầu câu trả lời của mock', async () => {
      const lunch = findDishCandidates(db, { mealType: 'lunch', maxPriceVnd: 40_000, limit: 1_000 })
      const liked = lunch.at(-1)!

      const events = await collect(
        runChat(db, {
          ...ask('trưa nay 40k ăn gì'),
          preferences: { ...NO_PREFERENCES, liked: new Set([liked.id]) },
        }),
      )

      expect(metaOf(events).dishes[0]?.id).toBe(liked.id)
    })
  })
})
