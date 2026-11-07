import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from './client'
import { findDishCandidates, listAllDishes } from './queries'
import { seedDatabase } from './seed'

const migrationsFolder = new URL('../migrations', import.meta.url).pathname

describe('findDishCandidates', () => {
  let db: Db
  let sqlite: ReturnType<typeof createDb>['sqlite']

  beforeAll(() => {
    const connection = createDb(':memory:')
    db = connection.db
    sqlite = connection.sqlite
    migrate(db, { migrationsFolder })
    seedDatabase(db)
  })

  afterAll(() => {
    sqlite.close()
  })

  it('chỉ trả món phục vụ bữa đang xét', () => {
    const candidates = findDishCandidates(db, { mealType: 'breakfast', maxPriceVnd: 60_000 })

    expect(candidates.length).toBeGreaterThan(0)
    for (const dish of candidates) expect(dish.mealTypes).toContain('breakfast')
  })

  it('loại món trong `excludeDishIds` trước khi cắt theo `limit`', () => {
    const top = findDishCandidates(db, { mealType: 'lunch', maxPriceVnd: 60_000, limit: 3 })
    const excluded = top.map((dish) => dish.id)
    const rest = findDishCandidates(db, {
      mealType: 'lunch',
      maxPriceVnd: 60_000,
      limit: 3,
      excludeDishIds: excluded,
    })

    expect(rest).toHaveLength(3)
    for (const dish of rest) expect(excluded).not.toContain(dish.id)
  })

  it('đưa món trong `preferDishIds` vào cửa sổ ứng viên dù xếp chót theo độ no và giá', () => {
    const all = findDishCandidates(db, { mealType: 'lunch', maxPriceVnd: 60_000, limit: 1_000 })
    const last = all.at(-1)
    expect(last).toBeDefined()

    const window = findDishCandidates(db, {
      mealType: 'lunch',
      maxPriceVnd: 60_000,
      limit: 5,
      preferDishIds: [last!.id],
    })

    expect(window[0]?.id).toBe(last!.id)
    expect(window.slice(1).map((dish) => dish.id)).toEqual(all.slice(0, 4).map((dish) => dish.id))
  })

  it('vừa chán vừa thích: bỏ món chán, món thích lên đầu, phần còn lại giữ thứ tự gốc, đủ `limit`', () => {
    const all = findDishCandidates(db, { mealType: 'lunch', maxPriceVnd: 60_000, limit: 1_000 })
    expect(all.length).toBeGreaterThan(12)
    const disliked = all.slice(0, 6).map((dish) => dish.id)
    const liked = [all.at(-1)!.id, all.at(-2)!.id]

    const window = findDishCandidates(db, {
      mealType: 'lunch',
      maxPriceVnd: 60_000,
      limit: 5,
      excludeDishIds: disliked,
      preferDishIds: liked,
    })

    expect(window.map((dish) => dish.id)).toEqual([
      all.at(-2)!.id,
      all.at(-1)!.id,
      ...all.slice(6, 9).map((dish) => dish.id),
    ])
  })

  it('`preferDishIds` không kéo vào món vượt trần hay sai bữa', () => {
    const breakfastOnly = findDishCandidates(db, {
      mealType: 'breakfast',
      maxPriceVnd: 60_000,
      limit: 1_000,
    }).filter((dish) => !dish.mealTypes.includes('lunch'))
    const expensive = findDishCandidates(db, {
      mealType: 'lunch',
      maxPriceVnd: 500_000,
      limit: 1_000,
    }).filter((dish) => dish.priceVnd > 20_000)
    const preferred = [...breakfastOnly, ...expensive].map((dish) => dish.id)

    const window = findDishCandidates(db, {
      mealType: 'lunch',
      maxPriceVnd: 20_000,
      preferDishIds: preferred,
    })

    for (const dish of window) expect(preferred).not.toContain(dish.id)
  })

  it('không trả món vượt trần giá', () => {
    const candidates = findDishCandidates(db, { mealType: 'lunch', maxPriceVnd: 20_000 })

    expect(candidates.length).toBeGreaterThan(0)
    for (const dish of candidates) expect(dish.priceVnd).toBeLessThanOrEqual(20_000)
  })

  it('chỉ trả món chay khi yêu cầu vegetarian', () => {
    const candidates = findDishCandidates(db, {
      mealType: 'lunch',
      maxPriceVnd: 60_000,
      dietTags: ['vegetarian'],
    })

    expect(candidates.length).toBeGreaterThan(0)
    for (const dish of candidates) expect(dish.tags).toContain('vegetarian')
  })

  it('loại món chứa tag bị cấm', () => {
    const candidates = findDishCandidates(db, {
      mealType: 'lunch',
      maxPriceVnd: 60_000,
      dietTags: ['no-spicy'],
    })

    for (const dish of candidates) expect(dish.tags).not.toContain('spicy')
  })

  it('trả tối đa 20 ứng viên', () => {
    const candidates = findDishCandidates(db, { mealType: 'dinner', maxPriceVnd: 200_000 })

    expect(candidates.length).toBeLessThanOrEqual(20)
  })

  it('cửa sổ ứng viên có món sát trần, không chỉ 20 món rẻ nhất', () => {
    const candidates = findDishCandidates(db, { mealType: 'lunch', maxPriceVnd: 72_000 })

    expect(candidates).toHaveLength(20)
    expect(Math.max(...candidates.map((dish) => dish.priceVnd))).toBeGreaterThanOrEqual(55_000)
  })

  it('deterministic: cùng query cho cùng danh sách', () => {
    const query = { mealType: 'lunch' as const, maxPriceVnd: 45_000 }
    const first = findDishCandidates(db, query).map((dish) => dish.id)
    const second = findDishCandidates(db, query).map((dish) => dish.id)

    expect(first).toEqual(second)
  })
})

describe('listAllDishes', () => {
  let db: Db
  let sqlite: ReturnType<typeof createDb>['sqlite']

  beforeAll(() => {
    const connection = createDb(':memory:')
    db = connection.db
    sqlite = connection.sqlite
    migrate(db, { migrationsFolder })
    seedDatabase(db)
  })

  afterAll(() => {
    sqlite.close()
  })

  it('trả đủ 100 món seed, sắp theo slug', () => {
    const dishes = listAllDishes(db)
    const slugs = dishes.map((dish) => dish.slug)

    expect(dishes).toHaveLength(100)
    expect(slugs).toEqual([...slugs].sort())
    expect(new Set(slugs).size).toBe(100)
  })

  it('mỗi món có đủ dữ liệu để vẽ thẻ ở cả hai ngôn ngữ', () => {
    const comTam = listAllDishes(db).find((dish) => dish.slug === 'com-tam')

    expect(comTam).toMatchObject({
      nameVi: 'Cơm tấm',
      nameEn: 'Broken rice',
      priceVnd: expect.any(Number),
      mealTypes: expect.arrayContaining(['lunch']),
      tags: expect.any(Array),
      region: expect.any(String),
      prepMinutes: expect.any(Number),
      fillLevel: expect.any(Number),
    })
    expect(comTam?.descVi.length).toBeGreaterThan(0)
    expect(comTam?.descEn.length).toBeGreaterThan(0)
  })

  it('không gửi xuống client khoảng giá nội bộ hay cột quản trị', () => {
    const [first] = listAllDishes(db)

    expect(Object.keys(first ?? {}).sort()).toEqual(
      [
        'id',
        'slug',
        'nameVi',
        'nameEn',
        'priceVnd',
        'mealTypes',
        'tags',
        'region',
        'prepMinutes',
        'fillLevel',
        'descVi',
        'descEn',
      ].sort(),
    )
  })
})
