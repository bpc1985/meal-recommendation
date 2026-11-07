import type { DishCandidate, MealType } from '@mam/domain'
import { describe, expect, it } from 'vitest'
import { applyGuards } from './guards'
import { createMockAdvisor } from './mock'
import { rankCandidates } from './rank'
import type { PickRequest } from './types'

export function makeDish(overrides: Partial<DishCandidate> & { id: string }): DishCandidate {
  return {
    nameVi: `Món ${overrides.id}`,
    nameEn: `Dish ${overrides.id}`,
    priceVnd: 40_000,
    mealTypes: ['lunch'] as MealType[],
    tags: [],
    fillLevel: 2,
    prepMinutes: 15,
    ...overrides,
  }
}

export const baseRequest = (overrides: Partial<PickRequest> = {}): PickRequest => ({
  roleSlug: 'student',
  mealType: 'lunch',
  dailyBudgetVnd: 60_000,
  mealBudgetVnd: 24_000,
  dietTags: [],
  locale: 'vi',
  ...overrides,
})

describe('rankCandidates', () => {
  const candidates: DishCandidate[] = [
    makeDish({ id: 'cheap-veg', priceVnd: 20_000, tags: ['vegetarian'], fillLevel: 2 }),
    makeDish({ id: 'over-budget', priceVnd: 90_000, fillLevel: 3 }),
    makeDish({ id: 'in-budget-filling', priceVnd: 23_000, fillLevel: 3 }),
    makeDish({ id: 'spicy', priceVnd: 21_000, tags: ['spicy'], fillLevel: 2 }),
  ]

  it('xếp món vừa ngân sách lên trước món vượt ngân sách', () => {
    const ranked = rankCandidates(baseRequest(), candidates)
    const overIndex = ranked.findIndex((item) => item.dish.id === 'over-budget')
    const inBudgetIndex = ranked.findIndex((item) => item.dish.id === 'in-budget-filling')

    expect(inBudgetIndex).toBeGreaterThanOrEqual(0)
    expect(overIndex).toBeGreaterThan(inBudgetIndex)
  })

  it('deterministic: cùng input cho cùng thứ tự', () => {
    const first = rankCandidates(baseRequest(), candidates).map((item) => item.dish.id)
    const second = rankCandidates(baseRequest(), candidates).map((item) => item.dish.id)

    expect(first).toEqual(second)
  })

  it('loại món không phục vụ bữa đang xét', () => {
    const onlyDinner = [makeDish({ id: 'dinner-only', mealTypes: ['dinner'] })]
    expect(rankCandidates(baseRequest(), onlyDinner)).toHaveLength(0)
  })

  it('loại món chứa tag bị loại trừ', () => {
    const ranked = rankCandidates(baseRequest({ dietTags: ['no-spicy'] }), candidates)
    expect(ranked.map((item) => item.dish.id)).not.toContain('spicy')
  })

  it('chỉ giữ món chay khi user chọn ăn chay', () => {
    const ranked = rankCandidates(baseRequest({ dietTags: ['vegetarian'] }), candidates)
    expect(ranked.map((item) => item.dish.id)).toEqual(['cheap-veg'])
  })

  it('ưu tiên món độn bụng hơn khi cùng giá', () => {
    const samePrice = [
      makeDish({ id: 'light', priceVnd: 20_000, fillLevel: 1 }),
      makeDish({ id: 'filling', priceVnd: 20_000, fillLevel: 3 }),
    ]
    const ranked = rankCandidates(baseRequest(), samePrice)
    expect(ranked[0]?.dish.id).toBe('filling')
  })

  it('ưu tiên món dùng gần hết trần bữa thay vì món rẻ hơn', () => {
    const sameFill = [
      makeDish({ id: 'cheap', priceVnd: 10_000, fillLevel: 3 }),
      makeDish({ id: 'near-cap', priceVnd: 23_000, fillLevel: 3 }),
    ]
    const ranked = rankCandidates(baseRequest({ mealBudgetVnd: 24_000 }), sameFill)

    expect(ranked[0]?.dish.id).toBe('near-cap')
  })

  it('mọi điểm xếp hạng là số hữu hạn', () => {
    for (const item of rankCandidates(baseRequest(), candidates)) {
      expect(Number.isFinite(item.score)).toBe(true)
    }
  })
})

describe('rankCandidates với món thích', () => {
  it('món thích vừa ngân sách thắng món không thích cùng điểm', () => {
    const twins = [
      makeDish({ id: 'a-plain', priceVnd: 20_000 }),
      makeDish({ id: 'b-liked', priceVnd: 20_000 }),
    ]
    const ranked = rankCandidates(baseRequest({ likedDishIds: new Set(['b-liked']) }), twins)

    expect(ranked.map((item) => item.dish.id)).toEqual(['b-liked', 'a-plain'])
  })

  it('món thích rẻ, ít no vẫn thắng món không thích sát trần, no và làm nhanh', () => {
    const dishes = [
      makeDish({ id: 'best-plain', priceVnd: 24_000, fillLevel: 3, prepMinutes: 5 }),
      makeDish({ id: 'weak-liked', priceVnd: 1_000, fillLevel: 1, prepMinutes: 60 }),
    ]
    const ranked = rankCandidates(baseRequest({ likedDishIds: new Set(['weak-liked']) }), dishes)

    expect(ranked[0]?.dish.id).toBe('weak-liked')
  })

  it('ca xấu nhất: món thích 0đ, ít no, làm lâu vẫn thắng món không thích đúng trần, no nhất, làm nhanh', () => {
    // Chênh tối đa giữa hai món vừa ngân sách là 30 (sát trần) + 12 (độ no) + 3 (làm nhanh) = 45.
    // Hoà điểm thì xếp theo id, nên id món không thích đứng trước: thưởng phải lớn hơn hẳn 45.
    const dishes = [
      makeDish({ id: 'a-best-plain', priceVnd: 24_000, fillLevel: 3, prepMinutes: 10 }),
      makeDish({ id: 'z-weak-liked', priceVnd: 0, fillLevel: 1, prepMinutes: 11 }),
    ]
    const ranked = rankCandidates(baseRequest({ likedDishIds: new Set(['z-weak-liked']) }), dishes)

    expect(ranked.map((item) => item.dish.id)).toEqual(['z-weak-liked', 'a-best-plain'])
  })

  it('món thích vượt ngân sách không có lý do `liked`, vì không được cộng điểm thích', () => {
    const ranked = rankCandidates(baseRequest({ likedDishIds: new Set(['over-liked']) }), [
      makeDish({ id: 'over-liked', priceVnd: 24_001 }),
    ])

    expect(ranked[0]?.reasons).not.toContain('liked')
    expect(ranked[0]?.reasons).not.toContain('in_budget')
  })

  it('món thích vượt ngân sách dù chỉ 1đ không thắng món vừa ngân sách yếu nhất', () => {
    const dishes = [
      makeDish({ id: 'over-liked', priceVnd: 24_001, fillLevel: 3, prepMinutes: 5 }),
      makeDish({ id: 'weak-plain', priceVnd: 1_000, fillLevel: 1, prepMinutes: 60 }),
    ]
    const ranked = rankCandidates(baseRequest({ likedDishIds: new Set(['over-liked']) }), dishes)

    expect(ranked.map((item) => item.dish.id)).toEqual(['weak-plain', 'over-liked'])
  })

  it('giữa các món thích vẫn ưu tiên món sát trần', () => {
    const dishes = [
      makeDish({ id: 'liked-cheap', priceVnd: 10_000, fillLevel: 3 }),
      makeDish({ id: 'liked-near-cap', priceVnd: 23_000, fillLevel: 3 }),
    ]
    const liked = new Set(['liked-cheap', 'liked-near-cap'])
    const ranked = rankCandidates(baseRequest({ likedDishIds: liked }), dishes)

    expect(ranked[0]?.dish.id).toBe('liked-near-cap')
  })

  it('món thích có lý do `liked` để giải thích cho user', () => {
    const ranked = rankCandidates(baseRequest({ likedDishIds: new Set(['liked']) }), [
      makeDish({ id: 'liked', priceVnd: 20_000 }),
    ])

    expect(ranked[0]?.reasons).toContain('liked')
  })

  it('mock chọn món thích và nói rõ đó là món user thích', async () => {
    const dishes = [
      makeDish({ id: 'best-plain', priceVnd: 24_000, fillLevel: 3 }),
      makeDish({ id: 'weak-liked', priceVnd: 12_000, fillLevel: 1 }),
    ]
    const result = await createMockAdvisor().pick(
      baseRequest({ likedDishIds: new Set(['weak-liked']) }),
      dishes,
    )

    expect(result.picks[0]?.dishId).toBe('weak-liked')
    expect(result.picks[0]?.reasonVi).toContain('món bạn thích')
    expect(result.picks[0]?.reasonEn).toContain('one you like')
  })
})

describe('applyGuards', () => {
  const candidates = [
    makeDish({ id: 'a', priceVnd: 10_000 }),
    makeDish({ id: 'b', priceVnd: 20_000 }),
    makeDish({ id: 'c', priceVnd: 50_000 }),
  ]

  it('loại dishId không nằm trong danh sách ứng viên (AI bịa)', () => {
    const result = applyGuards(
      [{ dishId: 'ghost', reasonVi: '', reasonEn: '' }],
      candidates,
      24_000,
    )
    expect(result.picks).toHaveLength(0)
    expect(result.rejected).toEqual(['ghost'])
  })

  it('loại pick làm tổng vượt ngân sách bữa', () => {
    const result = applyGuards(
      [
        { dishId: 'b', reasonVi: '', reasonEn: '' },
        { dishId: 'c', reasonVi: '', reasonEn: '' },
      ],
      candidates,
      24_000,
    )

    expect(result.picks.map((pick) => pick.dishId)).toEqual(['b'])
  })

  it('khử trùng lặp', () => {
    const result = applyGuards(
      [
        { dishId: 'a', reasonVi: '', reasonEn: '' },
        { dishId: 'a', reasonVi: '', reasonEn: '' },
      ],
      candidates,
      24_000,
    )

    expect(result.picks).toHaveLength(1)
  })

  it('giữ thứ tự ưu tiên của AI', () => {
    const result = applyGuards(
      [
        { dishId: 'b', reasonVi: '', reasonEn: '' },
        { dishId: 'a', reasonVi: '', reasonEn: '' },
      ],
      candidates,
      32_000,
    )

    expect(result.picks.map((pick) => pick.dishId)).toEqual(['b', 'a'])
  })

  it('tính cộng dồn: pick sau bị loại nếu tổng vượt ngân sách', () => {
    const result = applyGuards(
      [
        { dishId: 'a', reasonVi: '', reasonEn: '' },
        { dishId: 'b', reasonVi: '', reasonEn: '' },
      ],
      candidates,
      24_000,
    )

    expect(result.picks.map((pick) => pick.dishId)).toEqual(['a'])
    expect(result.rejected).toEqual(['b'])
  })
})

describe('createMockAdvisor', () => {
  const candidates = [
    makeDish({ id: 'a', priceVnd: 12_000, fillLevel: 3 }),
    makeDish({ id: 'b', priceVnd: 20_000, fillLevel: 2 }),
  ]

  it('chọn món trong danh sách ứng viên, ưu tiên món dùng gần hết ngân sách bữa', async () => {
    const advisor = createMockAdvisor()
    const result = await advisor.pick(baseRequest(), candidates)

    expect(result.source).toBe('mock')
    expect(result.picks.length).toBeGreaterThan(0)
    expect(result.picks[0]?.dishId).toBe('b')
  })

  it('trả tip theo ngôn ngữ', async () => {
    const advisor = createMockAdvisor()

    const vi = await advisor.pick(baseRequest(), candidates)
    const en = await advisor.pick(baseRequest({ locale: 'en' }), candidates)

    expect(vi.tip).not.toBe(en.tip)
    expect(vi.tip.length).toBeGreaterThan(0)
  })

  it('không có ứng viên phù hợp → trả rỗng chứ không throw', async () => {
    const advisor = createMockAdvisor()
    const result = await advisor.pick(baseRequest(), [])

    expect(result.picks).toEqual([])
    expect(result.source).toBe('fallback')
  })
})
