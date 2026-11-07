import type { MealType } from '@mam/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertUser } from './accounts'
import type { Db } from './client'
import {
  deletePlanForUser,
  findPlanForUser,
  insertPlan,
  listPlansForUser,
  updatePlanItem,
  type NewPlanItemRecord,
} from './plans'
import { findDishCandidates } from './queries'
import { dishes, planItems } from './schema'
import { createTestDb } from './testing'

const startDate = '2026-11-02'

function itemsFor(db: Db, planIdOffset = 0): NewPlanItemRecord[] {
  const meals: MealType[] = ['breakfast', 'lunch', 'dinner']
  const ids = meals.map(
    (mealType) =>
      findDishCandidates(db, { mealType, maxPriceVnd: 100_000, limit: 5 })[planIdOffset]!.id,
  )

  return [
    { dayIndex: 0, mealType: 'breakfast', dishId: ids[0]!, priceVnd: 25_000 },
    { dayIndex: 0, mealType: 'lunch', dishId: ids[1]!, priceVnd: 40_000 },
    { dayIndex: 0, mealType: 'dinner', dishId: ids[2]!, priceVnd: 35_000 },
    { dayIndex: 1, mealType: 'breakfast', dishId: ids[0]!, priceVnd: 25_000 },
    { dayIndex: 1, mealType: 'lunch', dishId: ids[1]!, priceVnd: 40_000 },
    { dayIndex: 1, mealType: 'dinner', dishId: ids[2]!, priceVnd: 35_000 },
  ]
}

describe('plan queries', () => {
  let db: Db
  let sqlite: ReturnType<typeof createTestDb>['sqlite']
  let userA: string
  let userB: string

  beforeEach(() => {
    const connection = createTestDb()
    db = connection.db
    sqlite = connection.sqlite
    userA = insertUser(db, { email: 'an@example.com', passwordHash: 'scrypt$stub' }).id
    userB = insertUser(db, { email: 'binh@example.com', passwordHash: 'scrypt$stub' }).id
  })

  afterEach(() => {
    sqlite.close()
  })

  it('lưu plan + items trong một transaction và đọc lại đúng thứ tự bữa', () => {
    const planId = insertPlan(
      db,
      {
        userId: userA,
        title: 'Tuần của An',
        startDate,
        days: 2,
        budgetUnit: 'day',
        budgetAmount: 100_000,
        dailyBudgetVnd: 100_000,
        roleSlug: 'student',
      },
      itemsFor(db),
    )

    const found = findPlanForUser(db, planId, userA)

    expect(found).not.toBeNull()
    expect(found?.plan.title).toBe('Tuần của An')
    expect(found?.items).toHaveLength(6)
    expect(found?.items.map((item) => item.dayIndex)).toEqual([0, 0, 0, 1, 1, 1])
    expect(found?.items.map((item) => item.mealType)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'breakfast',
      'lunch',
      'dinner',
    ])
    expect(found?.items[0]?.nameVi).toBeTruthy()
    expect(found?.items[0]?.nameEn).toBeTruthy()
  })

  it('listPlansForUser chỉ trả plan của mình, kèm tổng tiền và số món', () => {
    const older = insertPlan(
      db,
      {
        userId: userA,
        title: 'Plan cũ',
        startDate,
        days: 1,
        budgetUnit: 'day',
        budgetAmount: 100_000,
        dailyBudgetVnd: 100_000,
        roleSlug: 'student',
      },
      itemsFor(db).slice(0, 3),
    )
    const newer = insertPlan(
      db,
      {
        userId: userA,
        title: 'Plan mới',
        startDate,
        days: 2,
        budgetUnit: 'day',
        budgetAmount: 100_000,
        dailyBudgetVnd: 100_000,
        roleSlug: 'student',
      },
      itemsFor(db, 1),
    )
    insertPlan(
      db,
      {
        userId: userB,
        title: 'Plan của Bình',
        startDate,
        days: 1,
        budgetUnit: 'day',
        budgetAmount: 100_000,
        dailyBudgetVnd: 100_000,
        roleSlug: 'student',
      },
      itemsFor(db).slice(0, 3),
    )

    const plans = listPlansForUser(db, userA)

    expect(plans.map((plan) => plan.id)).toEqual([newer, older])
    expect(plans[0]?.itemCount).toBe(6)
    expect(plans[0]?.totalVnd).toBe(2 * (25_000 + 40_000 + 35_000))
    expect(plans[1]?.totalVnd).toBe(100_000)
  })

  it('plan của user khác coi như không tồn tại', () => {
    const planId = insertPlan(
      db,
      {
        userId: userB,
        title: 'Riêng tư',
        startDate,
        days: 1,
        budgetUnit: 'day',
        budgetAmount: 100_000,
        dailyBudgetVnd: 100_000,
        roleSlug: 'student',
      },
      itemsFor(db).slice(0, 3),
    )

    expect(findPlanForUser(db, planId, userA)).toBeNull()
    expect(listPlansForUser(db, userA)).toEqual([])
  })

  it('chỉ chủ sở hữu xoá được; xoá plan thì cascade xoá items', () => {
    const planId = insertPlan(
      db,
      {
        userId: userA,
        title: 'Xoá được',
        startDate,
        days: 2,
        budgetUnit: 'day',
        budgetAmount: 100_000,
        dailyBudgetVnd: 100_000,
        roleSlug: 'student',
      },
      itemsFor(db),
    )

    expect(deletePlanForUser(db, planId, userB)).toBe(false)
    expect(db.select().from(planItems).all()).toHaveLength(6)

    expect(deletePlanForUser(db, planId, userA)).toBe(true)
    expect(findPlanForUser(db, planId, userA)).toBeNull()
    expect(db.select().from(planItems).all()).toHaveLength(0)
  })

  it('lưu chế độ ăn của thực đơn; thực đơn không ghi chế độ ăn đọc ra là mảng rỗng', () => {
    const base = {
      userId: userA,
      startDate,
      days: 1,
      budgetUnit: 'day',
      budgetAmount: 100_000,
      dailyBudgetVnd: 100_000,
      roleSlug: 'student',
    }
    const veg = insertPlan(
      db,
      { ...base, title: 'Chay', dietTags: ['no-spicy', 'vegetarian'] },
      itemsFor(db).slice(0, 3),
    )
    const legacy = insertPlan(db, { ...base, title: 'Cũ' }, itemsFor(db).slice(0, 3))

    expect(findPlanForUser(db, veg, userA)?.plan.dietTags).toEqual(['no-spicy', 'vegetarian'])
    expect(findPlanForUser(db, legacy, userA)?.plan.dietTags).toEqual([])
  })

  describe('updatePlanItem', () => {
    function planOf(userId: string): string {
      return insertPlan(
        db,
        {
          userId,
          title: 'Đổi món',
          startDate,
          days: 2,
          budgetUnit: 'day',
          budgetAmount: 100_000,
          dailyBudgetVnd: 100_000,
          roleSlug: 'student',
        },
        itemsFor(db),
      )
    }

    const otherLunch = () =>
      findDishCandidates(db, { mealType: 'lunch', maxPriceVnd: 100_000, limit: 5 })[3]!

    it('đổi đúng một hàng, giá lấy từ bảng dishes', () => {
      const planId = planOf(userA)
      const before = db.select().from(planItems).all()
      const dish = otherLunch()

      expect(
        updatePlanItem(db, userA, { planId, dayIndex: 1, mealType: 'lunch', dishId: dish.id }),
      ).toBe(true)

      const after = db.select().from(planItems).all()
      const changed = after.filter(
        (row) =>
          before.find((old) => old.id === row.id)?.dishId !== row.dishId ||
          before.find((old) => old.id === row.id)?.priceVnd !== row.priceVnd,
      )
      expect(changed).toHaveLength(1)
      expect(changed[0]).toMatchObject({ dayIndex: 1, mealType: 'lunch', dishId: dish.id })
      const dbPrice = db
        .select()
        .from(dishes)
        .all()
        .find((row) => row.id === dish.id)!.priceVnd
      expect(changed[0]?.priceVnd).toBe(dbPrice)
    })

    it('không sửa được thực đơn của user khác, DB giữ nguyên', () => {
      const planId = planOf(userB)
      const before = db.select().from(planItems).all()

      expect(
        updatePlanItem(db, userA, {
          planId,
          dayIndex: 0,
          mealType: 'lunch',
          dishId: otherLunch().id,
        }),
      ).toBe(false)
      expect(db.select().from(planItems).all()).toEqual(before)
    })

    it('món không tồn tại hoặc ô không tồn tại thì trả false', () => {
      const planId = planOf(userA)
      const before = db.select().from(planItems).all()

      expect(
        updatePlanItem(db, userA, { planId, dayIndex: 0, mealType: 'lunch', dishId: 'không-có' }),
      ).toBe(false)
      expect(
        updatePlanItem(db, userA, {
          planId,
          dayIndex: 5,
          mealType: 'lunch',
          dishId: otherLunch().id,
        }),
      ).toBe(false)
      expect(db.select().from(planItems).all()).toEqual(before)
    })
  })
})
