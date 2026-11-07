import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb, resolveDatabasePath } from './client'
import { seedDatabase } from './seed'

const MIGRATIONS_FOLDER = new URL('../migrations', import.meta.url).pathname

/**
 * Chuẩn bị DB cho một môi trường mới (Docker container, DB tạm của e2e): chạy
 * migration rồi seed. Cả hai đều idempotent nên gọi lại mỗi lần container khởi
 * động là an toàn — không xoá dữ liệu người dùng đã tạo.
 */
export function bootstrapDatabase(databasePath = resolveDatabasePath()) {
  const { db, sqlite } = createDb(databasePath)

  try {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    return { databasePath, ...seedDatabase(db) }
  } finally {
    sqlite.close()
  }
}
