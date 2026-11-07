import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from './client'
import { seedDatabase } from './seed'

const MIGRATIONS_FOLDER = new URL('../migrations', import.meta.url).pathname

/**
 * DB in-memory đã migrate (và mặc định đã seed) cho test. Chỉ dùng trong test —
 * export qua subpath `@mam/db/testing` để app không import nhầm vào production.
 */
export function createTestDb(options: { seed?: boolean } = {}) {
  const connection = createDb(':memory:')
  migrate(connection.db, { migrationsFolder: MIGRATIONS_FOLDER })

  if (options.seed !== false) seedDatabase(connection.db)

  return connection
}

export { seedDatabase }
