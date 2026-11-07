import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import { schema } from './schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>

/** `Db` hoặc transaction đang mở: hàm nhận kiểu này chạy được bên trong `db.transaction`. */
export type DbExecutor = BaseSQLiteDatabase<'sync', Database.RunResult, typeof schema>

/**
 * Tìm thư mục gốc repo bằng cách đi ngược từ cwd tìm pnpm-workspace.yaml.
 * Cần thiết vì script chạy ở packages/db còn web chạy ở apps/web.
 */
function findRepoRoot(startDir: string): string | null {
  let current = resolve(startDir)

  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current

    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export function resolveDatabasePath(cwd = process.cwd()): string {
  const fromEnv = process.env.DATABASE_PATH
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(cwd, fromEnv)
  }

  const root = findRepoRoot(cwd) ?? cwd
  return join(root, 'data', 'mam.db')
}

export function createDb(databasePath: string) {
  const inMemory = databasePath === ':memory:'

  if (!inMemory) {
    mkdirSync(dirname(databasePath), { recursive: true })
  }

  const sqlite = new Database(databasePath)
  sqlite.pragma('foreign_keys = ON')

  if (!inMemory) {
    sqlite.pragma('journal_mode = WAL')
  }

  return { db: drizzle(sqlite, { schema }), sqlite }
}

let cached: ReturnType<typeof createDb> | undefined

/** Singleton cho server runtime — tránh mở nhiều handle trong dev HMR. */
export function getDb(): Db {
  cached ??= createDb(resolveDatabasePath())
  return cached.db
}

export function closeDb(): void {
  cached?.sqlite.close()
  cached = undefined
}
