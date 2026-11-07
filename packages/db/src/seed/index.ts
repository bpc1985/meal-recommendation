import type { Db } from '../client'
import { dishes, roles } from '../schema'
import { dishSeeds } from './dishes'
import { roleSeeds } from './roles'

export { dishSeeds } from './dishes'
export { roleSeeds } from './roles'

export interface SeedResult {
  dishes: number
  roles: number
}

/** Idempotent: chạy lại nhiều lần không nhân đôi dữ liệu (upsert theo slug). */
export function seedDatabase(db: Db): SeedResult {
  for (const role of roleSeeds) {
    db.insert(roles).values(role).onConflictDoUpdate({ target: roles.slug, set: role }).run()
  }

  for (const dish of dishSeeds) {
    db.insert(dishes).values(dish).onConflictDoUpdate({ target: dishes.slug, set: dish }).run()
  }

  return {
    dishes: db.select().from(dishes).all().length,
    roles: db.select().from(roles).all().length,
  }
}
