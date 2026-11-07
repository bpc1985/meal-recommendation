import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN_LENGTH, hashPassword, verifyPassword } from './password'

describe('hashPassword', () => {
  it('không lưu mật khẩu dạng thô và sinh salt khác nhau mỗi lần', async () => {
    const first = await hashPassword('matkhau123')
    const second = await hashPassword('matkhau123')

    expect(first).not.toContain('matkhau123')
    expect(first.startsWith('scrypt$')).toBe(true)
    expect(first).not.toBe(second)
  })

  it('verify đúng mật khẩu, sai mật khẩu và hash hỏng', async () => {
    const stored = await hashPassword('matkhau123')

    await expect(verifyPassword('matkhau123', stored)).resolves.toBe(true)
    await expect(verifyPassword('matkhau124', stored)).resolves.toBe(false)
    await expect(verifyPassword('matkhau123', 'not-a-hash')).resolves.toBe(false)
    await expect(verifyPassword('matkhau123', 'scrypt$16384$8$1$abc')).resolves.toBe(false)
  })

  it('từ chối mật khẩu ngắn hơn giới hạn', async () => {
    await expect(hashPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).rejects.toThrow(
      /PASSWORD_MIN_LENGTH/,
    )
  })
})
