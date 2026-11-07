import { defineConfig } from 'drizzle-kit'
import { resolveDatabasePath } from './src/client'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: resolveDatabasePath(),
  },
  verbose: true,
  strict: true,
})
