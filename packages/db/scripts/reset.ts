import { rmSync } from 'node:fs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb, resolveDatabasePath } from '../src/client'
import { seedDatabase } from '../src/seed'

const databasePath = resolveDatabasePath()

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${databasePath}${suffix}`, { force: true })
}

const { db, sqlite } = createDb(databasePath)
migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname })
const result = seedDatabase(db)
sqlite.close()

console.log(`Database reset: ${databasePath} (${result.dishes} dishes, ${result.roles} roles)`)
