import { deleteSessionsForUser, findUserByEmail, insertUser, type Db, type UserRow } from '@mam/db'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, hashPassword, verifyPassword } from './password'
import { createSession, findSessionUser, revokeSession } from './session'

/** Dữ liệu user được phép rời server — không bao giờ có `passwordHash`. */
export interface PublicUser {
  id: string
  email: string
  displayName: string | null
  locale: string
  roleSlug: string | null
  dailyBudgetVnd: number | null
  dietTags: string[]
  createdAt: number
}

export type AuthError = 'email_taken' | 'weak_password' | 'invalid_credentials'

export type AuthResult =
  { ok: true; user: PublicUser; token: string; expiresAt: number } | { ok: false; error: AuthError }

export interface RegisterInput {
  email: string
  password: string
  displayName?: string | null
  locale?: string
}

export interface LoginInput {
  email: string
  password: string
}

/**
 * Hash giả cố định để login với email không tồn tại vẫn tốn cùng thời gian scrypt
 * như email có thật — tránh dò user qua timing.
 */
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$' +
  'Y2FjYWNhY2FjYWNhY2FjYWNhY2FjYWNhY2FjYWNhY2FjYWNhY2FjYWNhY2FjYWNhY2FjYWNhY2E'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    locale: row.locale,
    roleSlug: row.roleSlug,
    dailyBudgetVnd: row.dailyBudgetVnd,
    dietTags: row.dietTags,
    createdAt: row.createdAt,
  }
}

export async function registerUser(db: Db, input: RegisterInput): Promise<AuthResult> {
  const password = input.password

  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: 'weak_password' }
  }

  const email = normalizeEmail(input.email)

  if (findUserByEmail(db, email)) {
    return { ok: false, error: 'email_taken' }
  }

  const passwordHash = await hashPassword(password)

  let row: UserRow
  try {
    row = insertUser(db, {
      email,
      passwordHash,
      displayName: input.displayName ?? null,
      locale: input.locale,
    })
  } catch (error) {
    // Hai request đăng ký cùng email có thể lọt qua check phía trên; UNIQUE là chốt cuối.
    if (error instanceof Error && /UNIQUE/i.test(error.message)) {
      return { ok: false, error: 'email_taken' }
    }

    throw error
  }

  const { token, expiresAt } = createSession(db, row.id)

  return { ok: true, user: toPublicUser(row), token, expiresAt }
}

export async function loginUser(db: Db, input: LoginInput): Promise<AuthResult> {
  const row = findUserByEmail(db, normalizeEmail(input.email))

  if (!row) {
    await verifyPassword(input.password, DUMMY_HASH)
    return { ok: false, error: 'invalid_credentials' }
  }

  if (!(await verifyPassword(input.password, row.passwordHash))) {
    return { ok: false, error: 'invalid_credentials' }
  }

  // Rotate: mỗi lần đăng nhập chỉ giữ đúng một session còn sống.
  deleteSessionsForUser(db, row.id)

  const { token, expiresAt } = createSession(db, row.id)

  return { ok: true, user: toPublicUser(row), token, expiresAt }
}

export function getSessionUser(db: Db, token: string | undefined): PublicUser | null {
  if (!token) return null

  const row = findSessionUser(db, token)
  return row ? toPublicUser(row) : null
}

export function logoutUser(db: Db, token: string | undefined): void {
  if (!token) return
  revokeSession(db, token)
}
