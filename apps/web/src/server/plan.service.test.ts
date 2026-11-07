import {
  dishes,
  findDishCandidates,
  findPlanForUser,
  insertPlan,
  insertUser,
  listPlansForUser,
  listRoles,
  setDishPreference,
  updatePlanItem,
  type Db,
} from '@mam/db'
import { createTestDb } from '@mam/db/testing'
import type { MealType } from '@mam/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPlanForUser, remainingBudgetOf, swapPlanMealForUser } from './plan.service'

const startDate = '2026-11-02'

describe('createPlanForUser', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']
  let userId: string

  beforeEach(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
    userId = insertUser(db, { email: 'an@example.com', passwordHash: 'scrypt$stub' }).id
  })

  afterEach(() => {
    sqlite.close()
  })

  const create = (overrides: Partial<Parameters<typeof createPlanForUser>[2]> = {}) =>
    createPlanForUser(db, userId, {
      days: 30,
      budget: { unit: 'month', amount: 2_500_000 },
      roleSlug: 'student',
      dietTags: [],
      startDate,
      title: 'Thực đơn 30 ngày',
      ...overrides,
    })

  it('plan 30 ngày với 2,5tr: đủ 3 bữa/ngày, tổng không vượt ngân sách, không lặp món trong 2 ngày', () => {
    const result = create()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const detail = findPlanForUser(db, result.planId, userId)
    expect(detail).not.toBeNull()
    expect(detail?.items).toHaveLength(90)
    expect(detail?.plan.totalVnd).toBe(result.totalVnd)
    expect(result.totalVnd).toBeLessThanOrEqual(2_500_000)

    const byDay = new Map<number, { total: number; dishIds: string[]; meals: MealType[] }>()

    for (const item of detail!.items) {
      const day = byDay.get(item.dayIndex) ?? { total: 0, dishIds: [], meals: [] }
      day.total += item.priceVnd
      day.dishIds.push(item.dishId)
      day.meals.push(item.mealType)
      byDay.set(item.dayIndex, day)
    }

    expect(byDay.size).toBe(30)

    for (const day of byDay.values()) {
      expect(day.meals.sort()).toEqual(['breakfast', 'dinner', 'lunch'])
      expect(day.total).toBeLessThanOrEqual(detail!.plan.dailyBudgetVnd)
      expect(new Set(day.dishIds).size).toBe(3)
    }

    for (let day = 1; day < 30; day += 1) {
      const previous = new Set(byDay.get(day - 1)!.dishIds)

      for (const dishId of byDay.get(day)!.dishIds) expect(previous.has(dishId)).toBe(false)
    }
  })

  it('ngân sách quá thấp → infeasible, không ghi plan nào, kèm mức tối thiểu', () => {
    const result = create({ budget: { unit: 'day', amount: 30_000 } })

    expect(result).toMatchObject({ ok: false, error: 'infeasible' })
    if (result.ok || result.error !== 'infeasible') return

    expect(result.minimumDailyBudgetVnd).toBeGreaterThan(0)
    expect(listPlansForUser(db, userId)).toEqual([])
  })

  it('60k/ngày trong 7 ngày vẫn xếp được (lấy đủ món rẻ làm ứng viên)', () => {
    const result = create({ days: 7, budget: { unit: 'day', amount: 60_000 } })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.totalVnd).toBeLessThanOrEqual(7 * 60_000)
    expect(findPlanForUser(db, result.planId, userId)?.items).toHaveLength(21)
  })

  it('role không tồn tại → invalid_role', () => {
    const result = create({ roleSlug: 'khong-co-that' })

    expect(result).toEqual({ ok: false, error: 'invalid_role' })
  })

  it('ăn chay → mọi món đều có tag vegetarian', () => {
    const result = create({
      days: 7,
      budget: { unit: 'day', amount: 120_000 },
      dietTags: ['vegetarian'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const detail = findPlanForUser(db, result.planId, userId)!
    const tagsById = new Map(
      db
        .select()
        .from(dishes)
        .all()
        .map((dish) => [dish.id, dish.tags]),
    )

    expect(detail.items).toHaveLength(21)
    for (const item of detail.items) expect(tagsById.get(item.dishId)).toContain('vegetarian')
  })

  it('cùng input → cùng lịch món (seed suy ra từ request, không random)', () => {
    const first = create({ days: 7, budget: { unit: 'day', amount: 90_000 } })
    const second = create({ days: 7, budget: { unit: 'day', amount: 90_000 } })

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    const ids = (planId: string) =>
      findPlanForUser(db, planId, userId)!.items.map((item) => `${item.dayIndex}:${item.dishId}`)

    expect(ids(second.planId)).toEqual(ids(first.planId))
    expect(first.planId).not.toBe(second.planId)
  })

  it('lưu role và ngân sách gốc vào header plan', () => {
    const result = create({ days: 7, budget: { unit: 'day', amount: 75_000 } })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const detail = findPlanForUser(db, result.planId, userId)!
    const roles = listRoles(db)

    expect(detail.plan.roleSlug).toBe('student')
    expect(detail.plan.budgetUnit).toBe('day')
    expect(detail.plan.budgetAmount).toBe(75_000)
    expect(detail.plan.dailyBudgetVnd).toBe(75_000)
    expect(roles.some((role) => role.slug === 'student')).toBe(true)
  })

  describe('món chán', () => {
    const planDishIds = () =>
      (sqlite.prepare('select dish_id as id from plan_items').all() as Array<{ id: string }>).map(
        (row) => row.id,
      )

    it('thực đơn 7 ngày không có món chán, kể cả món rẻ nhất', () => {
      const breakfast = findDishCandidates(db, {
        mealType: 'breakfast',
        maxPriceVnd: 500_000,
        limit: 1_000,
      })
      const cheapest = [...breakfast].sort((a, b) => a.priceVnd - b.priceVnd)[0]!
      const first = create({ days: 7, budget: { unit: 'day', amount: 90_000 } })
      expect(first.ok).toBe(true)
      const used = [...new Set(planDishIds())].filter((id) => id !== cheapest.id).slice(0, 2)
      const disliked = [cheapest.id, ...used]
      for (const id of disliked) setDishPreference(db, userId, id, 'dislike')
      sqlite.prepare('delete from plan_items').run()

      const result = create({ days: 7, budget: { unit: 'day', amount: 90_000 } })

      expect(result.ok).toBe(true)
      const ids = planDishIds()
      expect(ids).toHaveLength(21)
      for (const id of disliked) expect(ids).not.toContain(id)
    })

    it('chán mọi món sáng → báo infeasible, không throw', () => {
      const breakfast = findDishCandidates(db, {
        mealType: 'breakfast',
        maxPriceVnd: 500_000,
        limit: 1_000,
      })
      for (const dish of breakfast) setDishPreference(db, userId, dish.id, 'dislike')

      const result = create({ days: 7, budget: { unit: 'day', amount: 90_000 } })

      expect(result).toMatchObject({ ok: false, error: 'infeasible' })
    })

    it('món chán của user khác không ảnh hưởng thực đơn của mình', () => {
      const first = create({ days: 7, budget: { unit: 'day', amount: 90_000 } })
      expect(first.ok).toBe(true)
      const before = planDishIds()
      const other = insertUser(db, { email: 'binh@example.com', passwordHash: 'scrypt$stub' }).id
      for (const id of new Set(before)) setDishPreference(db, other, id, 'dislike')
      sqlite.prepare('delete from plan_items').run()

      create({ days: 7, budget: { unit: 'day', amount: 90_000 } })

      expect(planDishIds()).toEqual(before)
    })
  })
})

describe('ngân sách còn lại của thực đơn', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']
  let userId: string

  beforeEach(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
    userId = insertUser(db, { email: 'an@example.com', passwordHash: 'scrypt$stub' }).id
  })

  afterEach(() => {
    sqlite.close()
  })

  const createDetail = (
    input: Pick<Parameters<typeof createPlanForUser>[2], 'days' | 'budget'>,
  ) => {
    const result = createPlanForUser(db, userId, {
      ...input,
      roleSlug: 'student',
      dietTags: [],
      startDate,
      title: 'Thực đơn',
    })
    if (!result.ok) throw new Error('không tạo được thực đơn')

    return findPlanForUser(db, result.planId, userId)!
  }

  it('ngân sách gốc là ngân sách ngày nhân số ngày: 2.500.000/tháng trong 30 ngày → 83.000 × 30', () => {
    const detail = createDetail({ days: 30, budget: { unit: 'month', amount: 2_500_000 } })
    const total = detail.items.reduce((sum, item) => sum + item.priceVnd, 0)

    expect(remainingBudgetOf(detail, '2026-12-31')).toEqual({
      kind: 'finished',
      spentVnd: total,
      remainingVnd: 2_490_000 - total,
      overspentVnd: 0,
    })
  })

  it('đã tiêu là tổng plan_items của các ngày trước hôm nay', () => {
    const detail = createDetail({ days: 7, budget: { unit: 'day', amount: 100_000 } })
    const spent = detail.items
      .filter((item) => item.dayIndex < 3)
      .reduce((sum, item) => sum + item.priceVnd, 0)

    expect(remainingBudgetOf(detail, '2026-11-05')).toEqual({
      kind: 'inProgress',
      spentVnd: spent,
      remainingVnd: 700_000 - spent,
      daysLeft: 4,
      newDailyVnd: Math.floor((700_000 - spent) / 4 / 1_000) * 1_000,
      overspentVnd: 0,
    })
  })

  it('thực đơn chưa tới ngày bắt đầu thì báo chưa bắt đầu', () => {
    const detail = createDetail({ days: 7, budget: { unit: 'day', amount: 100_000 } })

    expect(remainingBudgetOf(detail, '2026-11-01')).toEqual({ kind: 'notStarted' })
  })
})

describe('swapPlanMealForUser', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']
  let userId: string

  beforeEach(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
    userId = insertUser(db, { email: 'an@example.com', passwordHash: 'scrypt$stub' }).id
  })

  afterEach(() => {
    sqlite.close()
  })

  const createWeek = (dietTags: Array<'vegetarian' | 'no-spicy'> = []) => {
    const result = createPlanForUser(db, userId, {
      days: 7,
      budget: { unit: 'day', amount: 100_000 },
      roleSlug: 'student',
      dietTags,
      startDate,
      title: 'Tuần',
    })
    if (!result.ok) throw new Error('không tạo được thực đơn')
    return result.planId
  }

  const lunchOf = (planId: string, dayIndex: number) =>
    findPlanForUser(db, planId, userId)!.items.find(
      (item) => item.dayIndex === dayIndex && item.mealType === 'lunch',
    )!

  const dishPrice = (dishId: string) =>
    db
      .select()
      .from(dishes)
      .all()
      .find((dish) => dish.id === dishId)!.priceVnd

  const rows = () => sqlite.prepare('select * from plan_items order by id').all()

  it('lưu chế độ ăn của thực đơn lúc tạo', () => {
    const planId = createWeek(['vegetarian', 'no-spicy'])

    expect(findPlanForUser(db, planId, userId)?.plan.dietTags).toEqual(['no-spicy', 'vegetarian'])
  })

  it('đổi bữa trưa ngày 3: món trưa khác, giá từ DB, ngày không vượt ngân sách, không lặp ngày kề', () => {
    const planId = createWeek()
    const old = lunchOf(planId, 2)

    const result = swapPlanMealForUser(db, userId, { planId, dayIndex: 2, mealType: 'lunch' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const detail = findPlanForUser(db, planId, userId)!
    const lunch = lunchOf(planId, 2)
    expect(lunch.dishId).toBe(result.dishId)
    expect(lunch.dishId).not.toBe(old.dishId)
    expect(lunch.priceVnd).toBe(dishPrice(lunch.dishId))
    expect(result.priceVnd).toBe(lunch.priceVnd)
    const served = db
      .select()
      .from(dishes)
      .all()
      .find((dish) => dish.id === lunch.dishId)!.mealTypes
    expect(served).toContain('lunch')

    const day = (index: number) => detail.items.filter((item) => item.dayIndex === index)
    expect(day(2).reduce((sum, item) => sum + item.priceVnd, 0)).toBeLessThanOrEqual(100_000)
    const neighbours = [...day(1), ...day(3), ...day(2).filter((item) => item.mealType !== 'lunch')]
    expect(neighbours.map((item) => item.dishId)).not.toContain(lunch.dishId)
    expect(day(2)).toHaveLength(3)
  })

  it('bấm 3 lần với cùng món gốc ra 3 món khác nhau, càng về sau càng xa giá gốc', () => {
    const planId = createWeek()
    const anchor = lunchOf(planId, 2)
    const shown: Array<{ dishId: string; priceVnd: number }> = []

    for (let press = 0; press < 3; press += 1) {
      const result = swapPlanMealForUser(db, userId, {
        planId,
        dayIndex: 2,
        mealType: 'lunch',
        anchorDishId: anchor.dishId,
      })
      if (!result.ok) throw new Error(result.error)
      shown.push(result)
    }

    expect(new Set(shown.map((item) => item.dishId)).size).toBe(3)
    expect(shown.map((item) => item.dishId)).not.toContain(anchor.dishId)
    const distances = shown.map((item) => Math.abs(item.priceVnd - anchor.priceVnd))
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
  })

  it('thực đơn chay chỉ đổi sang món chay', () => {
    // Dựng thực đơn 1 ngày bằng tay: thực đơn do planner xếp phụ thuộc UUID ngẫu nhiên của món
    // seed, nên ô bất kỳ có thể hết món chay thay thế và test chập chờn.
    const vegFor = (mealType: MealType) =>
      findDishCandidates(db, {
        mealType,
        maxPriceVnd: 1_000_000,
        dietTags: ['vegetarian'],
        limit: 100,
      })
    const breakfast = vegFor('breakfast')[0]!
    const lunch = vegFor('lunch').find((dish) => dish.id !== breakfast.id)!
    const dinner = vegFor('dinner').find(
      (dish) => dish.id !== breakfast.id && dish.id !== lunch.id,
    )!
    const planId = insertPlan(
      db,
      {
        userId,
        title: 'Một ngày chay',
        startDate,
        days: 1,
        budgetUnit: 'day',
        budgetAmount: 1_000_000,
        dailyBudgetVnd: 1_000_000,
        roleSlug: 'student',
        dietTags: ['vegetarian'],
      },
      [breakfast, lunch, dinner].map((dish, index) => ({
        dayIndex: 0,
        mealType: (['breakfast', 'lunch', 'dinner'] as const)[index]!,
        dishId: dish.id,
        priceVnd: dish.priceVnd,
      })),
    )

    const result = swapPlanMealForUser(db, userId, { planId, dayIndex: 0, mealType: 'lunch' })

    if (!result.ok) throw new Error(result.error)
    const tags = db
      .select()
      .from(dishes)
      .all()
      .find((dish) => dish.id === result.dishId)!.tags
    expect(tags).toContain('vegetarian')
  })

  it('không đổi sang món user đã chán', () => {
    const planId = createWeek()
    const original = lunchOf(planId, 2)
    const first = swapPlanMealForUser(db, userId, { planId, dayIndex: 2, mealType: 'lunch' })
    if (!first.ok) throw new Error(first.error)
    updatePlanItem(db, userId, { planId, dayIndex: 2, mealType: 'lunch', dishId: original.dishId })
    setDishPreference(db, userId, first.dishId, 'dislike')

    const result = swapPlanMealForUser(db, userId, { planId, dayIndex: 2, mealType: 'lunch' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.dishId).not.toBe(first.dishId)
  })

  it('hết món thay thế → no_alternative, DB không đổi', () => {
    const planId = createWeek()
    const current = lunchOf(planId, 2)
    const lunches = findDishCandidates(db, {
      mealType: 'lunch',
      maxPriceVnd: 500_000,
      limit: 1_000,
    })
    for (const dish of lunches) {
      if (dish.id !== current.dishId) setDishPreference(db, userId, dish.id, 'dislike')
    }
    const before = rows()

    expect(swapPlanMealForUser(db, userId, { planId, dayIndex: 2, mealType: 'lunch' })).toEqual({
      ok: false,
      error: 'no_alternative',
    })
    expect(rows()).toEqual(before)
  })

  it('thực đơn của user khác → not_found, DB không đổi', () => {
    const planId = createWeek()
    const other = insertUser(db, { email: 'binh@example.com', passwordHash: 'scrypt$stub' }).id
    const before = rows()

    expect(swapPlanMealForUser(db, other, { planId, dayIndex: 2, mealType: 'lunch' })).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(rows()).toEqual(before)
  })
})
