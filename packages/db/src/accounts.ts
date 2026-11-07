import { and, eq, gt, lt } from 'drizzle-orm'
import type { Db } from './client'
import { sessions, users } from './schema'

export type UserRow = typeof users.$inferSelect
export type SessionRow = typeof sessions.$inferSelect

export function findUserByEmail(db: Db, email: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.email, email)).get()
}

export function findUserById(db: Db, id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get()
}

export interface NewUser {
  email: string
  passwordHash: string
  displayName?: string | null
  locale?: string
}

export function insertUser(db: Db, values: NewUser): UserRow {
  return db
    .insert(users)
    .values({
      email: values.email,
      passwordHash: values.passwordHash,
      displayName: values.displayName ?? null,
      locale: values.locale ?? 'vi',
    })
    .returning()
    .get()
}

export interface UserProfilePatch {
  displayName?: string | null
  locale?: string
  roleSlug?: string | null
  dailyBudgetVnd?: number | null
  dietTags?: string[]
}

export function updateUserProfile(
  db: Db,
  userId: string,
  patch: UserProfilePatch,
): UserRow | undefined {
  return db.update(users).set(patch).where(eq(users.id, userId)).returning().get()
}

export interface NewSession {
  userId: string
  tokenHash: string
  expiresAt: number
}

export function insertSession(db: Db, values: NewSession): SessionRow {
  return db.insert(sessions).values(values).returning().get()
}

/** Chỉ trả session còn hạn; session hết hạn coi như không tồn tại. */
export function findActiveSession(
  db: Db,
  tokenHash: string,
  now: number,
): { session: SessionRow; user: UserRow } | undefined {
  return db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .get()
}

export function deleteSessionByTokenHash(db: Db, tokenHash: string): void {
  db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run()
}

export function deleteSessionsForUser(db: Db, userId: string): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run()
}

export function deleteExpiredSessions(db: Db, now: number): void {
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run()
}
