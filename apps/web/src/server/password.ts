import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto'

/** `promisify` làm mất overload có options, nên bọc tay để giữ typing của `ScryptOptions`. */
function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

/** Ngắn hơn mức này bị từ chối ở cả server fn và service (hai lớp). */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 200

const ALGORITHM = 'scrypt'
const COST = 16_384
const BLOCK_SIZE = 8
const PARALLELIZATION = 1
const KEY_LENGTH = 64
const SALT_BYTES = 16

/**
 * Định dạng lưu: `scrypt$N$r$p$salt$hash` (base64url). Nhúng tham số vào hash để
 * sau này tăng cost mà không phải migrate mật khẩu cũ.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least PASSWORD_MIN_LENGTH (${PASSWORD_MIN_LENGTH}) chars`)
  }

  const salt = randomBytes(SALT_BYTES)
  const derived = (await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
  })) as Buffer

  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

/** So sánh timing-safe; hash hỏng/sai định dạng trả false thay vì ném lỗi. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$')
  if (parts.length !== 6 || parts[0] !== ALGORITHM) return false

  const [, cost, blockSize, parallelization, saltPart, hashPart] = parts
  const N = Number(cost)
  const r = Number(blockSize)
  const p = Number(parallelization)

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  let expected: Buffer
  let salt: Buffer

  try {
    expected = Buffer.from(hashPart ?? '', 'base64url')
    salt = Buffer.from(saltPart ?? '', 'base64url')
  } catch {
    return false
  }

  if (expected.length !== KEY_LENGTH || salt.length === 0) return false

  let derived: Buffer
  try {
    derived = (await scrypt(password, salt, expected.length, { N, r, p })) as Buffer
  } catch {
    return false
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected)
}
