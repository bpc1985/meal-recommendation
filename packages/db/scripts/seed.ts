import { createDb, resolveDatabasePath } from '../src/client'
import { seedDatabase } from '../src/seed'

const databasePath = resolveDatabasePath()
const { db, sqlite } = createDb(databasePath)
const result = seedDatabase(db)
sqlite.close()

console.log(`Seeded ${result.dishes} dishes and ${result.roles} roles into ${databasePath}`)
