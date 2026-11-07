import { bootstrapDatabase } from '../src/bootstrap'

const result = bootstrapDatabase()

console.log(`Bootstrapped ${result.databasePath}: ${result.dishes} dishes, ${result.roles} roles`)
