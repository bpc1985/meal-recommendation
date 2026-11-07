import type { DishCandidate, MealType } from '@mam/domain'
import { describe, expect, it } from 'vitest'
import { createMockAdvisor } from './mock'
import type { ChatRequest, ChatStreamEvent } from './types'

function dish(overrides: Partial<DishCandidate> & { id: string }): DishCandidate {
  return {
    nameVi: `Món ${overrides.id}`,
    nameEn: `Dish ${overrides.id}`,
    priceVnd: 30_000,
    mealTypes: ['lunch'] as MealType[],
    tags: [],
    fillLevel: 2,
    prepMinutes: 15,
    ...overrides,
  }
}

const dishes: DishCandidate[] = [
  dish({
    id: 'pho',
    nameVi: 'Phở bò',
    nameEn: 'Beef pho',
    priceVnd: 28_000,
    mealTypes: ['breakfast'],
    fillLevel: 3,
  }),
  dish({
    id: 'com-tam',
    nameVi: 'Cơm tấm',
    nameEn: 'Broken rice',
    priceVnd: 22_000,
    mealTypes: ['lunch'],
    fillLevel: 3,
  }),
  dish({
    id: 'canh-chua',
    nameVi: 'Canh chua cá',
    nameEn: 'Sour fish soup',
    priceVnd: 25_000,
    mealTypes: ['dinner'],
  }),
]

const chatRequest = (overrides: Partial<ChatRequest> = {}): ChatRequest => ({
  messages: [{ role: 'user', content: 'Ăn trưa 40k giúp mình' }],
  context: { dailyBudgetVnd: 60_000 },
  locale: 'vi',
  ...overrides,
})

async function collect(events: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const collected: ChatStreamEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

function textOf(events: ChatStreamEvent[]): string {
  return events
    .filter((event): event is { type: 'text'; text: string } => event.type === 'text')
    .map((event) => event.text)
    .join('')
}

function dishIds(events: ChatStreamEvent[]): string[] {
  return events
    .filter((event): event is { type: 'dish'; dishId: string } => event.type === 'dish')
    .map((event) => event.dishId)
}

describe('mock advisor chat', () => {
  it('trả lời đúng bữa trong câu hỏi, kèm thẻ món lấy từ candidates', async () => {
    const stream = await createMockAdvisor().stream(chatRequest(), dishes)
    const events = await collect(stream.events)
    const text = textOf(events)

    expect(stream.degraded).toBe(false)
    expect(text).toContain('Cơm tấm')
    expect(text).toContain('22.000')
    expect(text).not.toContain('Phở bò')
    expect(dishIds(events)).toEqual(['com-tam'])
  })

  it('đưa món thích vừa ngân sách lên đầu câu trả lời', async () => {
    const lunch = [
      dish({ id: 'best', nameVi: 'Cơm gà', priceVnd: 24_000, fillLevel: 3 }),
      dish({ id: 'liked', nameVi: 'Bánh mì', priceVnd: 15_000, fillLevel: 1 }),
    ]
    const stream = await createMockAdvisor().stream(
      chatRequest({
        context: { dailyBudgetVnd: 60_000, likedDishIds: new Set(['liked']) },
      }),
      lunch,
    )
    const events = await collect(stream.events)

    expect(dishIds(events)[0]).toBe('liked')
  })

  it('dùng tên tiếng Anh khi locale là en', async () => {
    const stream = await createMockAdvisor().stream(
      chatRequest({ locale: 'en', messages: [{ role: 'user', content: 'lunch please' }] }),
      dishes,
    )
    const text = textOf(await collect(stream.events))

    expect(text).toContain('Broken rice')
    expect(text).not.toContain('Cơm tấm')
    expect(text.toLowerCase()).toContain('lunch')
  })

  it('không có ứng viên → nói rõ chưa tìm được món, không bịa', async () => {
    const stream = await createMockAdvisor().stream(chatRequest(), [])
    const events = await collect(stream.events)

    expect(stream.degraded).toBe(false)
    expect(dishIds(events)).toEqual([])
    expect(textOf(events).length).toBeGreaterThan(0)
  })

  describe('cả ngày: ba bữa không trùng món (bất biến #3)', () => {
    const fullDay = (overrides: Partial<ChatRequest['context']> = {}, locale: 'vi' | 'en' = 'vi') =>
      chatRequest({
        messages: [{ role: 'user', content: 'Gợi ý ăn cả ngày 45k' }],
        context: { dailyBudgetVnd: 45_000, ...overrides },
        locale,
      })
    const chaGio = dish({
      id: 'cha-gio',
      nameVi: 'Chả giò',
      nameEn: 'Fried spring rolls',
      priceVnd: 15_000,
      mealTypes: ['lunch', 'dinner'],
    })
    const miTrung = dish({
      id: 'mi-trung',
      nameVi: 'Mì Hảo Hảo trứng',
      priceVnd: 9_000,
      mealTypes: ['breakfast'],
    })

    it('món duy nhất vừa cả trưa lẫn tối chỉ xuất hiện ở bữa trưa, bữa tối báo không còn món', async () => {
      const events = await collect(
        (await createMockAdvisor().stream(fullDay(), [miTrung, chaGio])).events,
      )
      const text = textOf(events)

      expect(text.match(/Chả giò/g)).toHaveLength(1)
      expect(dishIds(events)).toEqual(['mi-trung', 'cha-gio'])
      expect(text).toContain('Chưa có món nào cho bữa tối vừa ngân sách')
      expect(text).not.toContain('Tổng bữa tối')
    })

    it('bữa sau lấy món khác còn vừa trần thay vì lặp món bữa trước', async () => {
      const trungChien = dish({
        id: 'trung-chien',
        nameVi: 'Trứng chiên',
        priceVnd: 14_000,
        mealTypes: ['dinner'],
      })
      const events = await collect(
        (await createMockAdvisor().stream(fullDay(), [miTrung, chaGio, trungChien])).events,
      )

      expect(dishIds(events)).toEqual(['mi-trung', 'cha-gio', 'trung-chien'])
      expect(textOf(events)).not.toContain('Chưa có món nào')
    })

    it('món thích vẫn được ưu tiên nhưng chỉ ở bữa đầu tiên nhận nó', async () => {
      const goiCuon = dish({
        id: 'goi-cuon',
        nameVi: 'Gỏi cuốn',
        priceVnd: 16_000,
        mealTypes: ['lunch', 'dinner'],
        fillLevel: 3,
      })
      const events = await collect(
        (
          await createMockAdvisor().stream(fullDay({ likedDishIds: new Set(['cha-gio']) }), [
            miTrung,
            goiCuon,
            chaGio,
          ])
        ).events,
      )
      const ids = dishIds(events)

      expect(ids[1]).toBe('cha-gio')
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toContain('goi-cuon')
    })

    it('tiếng Anh: bữa hết món cũng được báo rõ', async () => {
      const text = textOf(
        await collect(
          (await createMockAdvisor().stream(fullDay({}, 'en'), [miTrung, chaGio])).events,
        ),
      )

      expect(text.match(/Fried spring rolls/g)).toHaveLength(1)
      expect(text).toContain('No dish left for dinner within')
    })
  })

  it('stream thành nhiều chunk để UI thấy chữ hiện dần', async () => {
    const stream = await createMockAdvisor().stream(chatRequest(), dishes)
    const textEvents = (await collect(stream.events)).filter((event) => event.type === 'text')

    expect(textEvents.length).toBeGreaterThan(1)
  })
})
