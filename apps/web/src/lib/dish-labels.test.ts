import { listAllDishes } from '@mam/db'
import { createTestDb } from '@mam/db/testing'
import { en, vi } from '@mam/i18n'
import { describe, expect, it } from 'vitest'

/*
 * Nhãn tag và mức no được tra bằng key ghép (`dishTag.${tag}`), nên `i18n:check`
 * không thấy chúng. Test này giữ lại bảo đảm: món seed không bao giờ hiện slug thô.
 */
describe('nhãn món trên /dishes', () => {
  const { db, sqlite } = createTestDb()
  const dishes = listAllDishes(db)
  sqlite.close()
  const tags = [...new Set(dishes.flatMap((dish) => dish.tags))].sort()
  const fillLevels = [...new Set(dishes.map((dish) => dish.fillLevel))].sort()

  it('mọi tag trong seed có nhãn ở cả vi và en', () => {
    const missing = tags.flatMap((tag) =>
      [vi, en].flatMap((dictionary) => (`dishTag.${tag}` in dictionary ? [] : [`dishTag.${tag}`])),
    )

    expect(tags.length).toBeGreaterThan(0)
    expect(missing).toEqual([])
  })

  it('mọi mức no trong seed có nhãn ở cả vi và en', () => {
    const missing = fillLevels.flatMap((level) =>
      [vi, en].flatMap((dictionary) =>
        `dishes.fill.${level}` in dictionary ? [] : [`dishes.fill.${level}`],
      ),
    )

    expect(missing).toEqual([])
  })
})
