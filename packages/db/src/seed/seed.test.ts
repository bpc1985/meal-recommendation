import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from '../client'
import { dishes, roles } from '../schema'
import { dishSeeds, roleSeeds, seedDatabase } from './index'

const migrationsFolder = new URL('../../migrations', import.meta.url).pathname

describe('seed data', () => {
  let db: Db
  let sqlite: ReturnType<typeof createDb>['sqlite']

  beforeAll(() => {
    const connection = createDb(':memory:')
    db = connection.db
    sqlite = connection.sqlite
    migrate(db, { migrationsFolder })
  })

  afterAll(() => {
    sqlite.close()
  })

  it('seed 100 món và 10 vai trò', () => {
    const result = seedDatabase(db)

    expect(result.dishes).toBe(100)
    expect(result.roles).toBe(10)
  })

  it('chạy lại không nhân đôi dữ liệu (idempotent)', () => {
    seedDatabase(db)
    const afterFirst = db.select().from(dishes).all().length

    seedDatabase(db)
    const afterSecond = db.select().from(dishes).all().length

    expect(afterSecond).toBe(afterFirst)
  })

  it('mỗi bữa có ít nhất 25 món để chọn', () => {
    const counts = { breakfast: 0, lunch: 0, dinner: 0 }

    for (const dish of dishSeeds) {
      for (const mealType of dish.mealTypes) counts[mealType] += 1
    }

    expect(counts.breakfast).toBeGreaterThanOrEqual(25)
    expect(counts.lunch).toBeGreaterThanOrEqual(25)
    expect(counts.dinner).toBeGreaterThanOrEqual(25)
  })

  it('có ít nhất 15 món chay', () => {
    const vegetarian = dishSeeds.filter((dish) => dish.tags?.includes('vegetarian'))
    expect(vegetarian.length).toBeGreaterThanOrEqual(15)
  })

  it('mọi món đều có tên vi/en và giá trong khoảng hợp lý', () => {
    for (const dish of dishSeeds) {
      expect(dish.nameVi.length).toBeGreaterThan(0)
      expect(dish.nameEn.length).toBeGreaterThan(0)
      expect(dish.priceMinVnd).toBeLessThanOrEqual(dish.priceVnd)
      expect(dish.priceMaxVnd).toBeGreaterThanOrEqual(dish.priceVnd)
    }
  })

  it('mọi vai trò có ngân sách ngày dương và slug duy nhất', () => {
    const slugs = new Set(roleSeeds.map((role) => role.slug))
    expect(slugs.size).toBe(roleSeeds.length)

    for (const role of roleSeeds) {
      expect(role.defaultDailyBudgetVnd).toBeGreaterThan(0)
      expect(role.nameVi.length).toBeGreaterThan(0)
      expect(role.nameEn.length).toBeGreaterThan(0)
    }

    expect(db.select().from(roles).all().length).toBeGreaterThan(0)
  })
})
